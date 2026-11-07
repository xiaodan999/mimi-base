#!/usr/bin/env python3
"""Trusted wrapper for the mimi-base sandbox.

Runs inside a transient systemd unit created by
`pocketbase/sandbox-exec.ts`: DynamicUser, read-only system, private /tmp,
no capabilities, a syscall filter, and a dedicated network namespace whose
egress firewall only permits DNS and HTTP(S) to public addresses.

Reads one JSON request on stdin, executes the user's Python in /tmp/sandbox,
and prints one JSON response on stdout. The user's code is never placed on
the command line.
"""

import base64
import contextlib
import json
import os
import shutil
import sys
import time
import traceback
import urllib.request

ROOT = os.environ.get("MIMI_SANDBOX_ROOT", "/tmp/sandbox")
MAX_FILES = 40
MAX_FILE_CHARS = 100_000
MAX_TOTAL_CHARS = 400_000
MAX_LOG_CHARS = 20_000
MAX_LOG_LINES = 100
MAX_RESULT_CHARS = 20_000
MAX_ARTIFACTS = 3
MAX_ARTIFACT_BYTES = 1_500_000
MAX_ARTIFACT_TOTAL_BYTES = 3_000_000
USER_AGENT = "mimi-base-sandbox/1.0"


def sniff_image_mime(data: bytes) -> str | None:
    """Only raster images the app renders in an `<img>`; SVG stays text."""
    if data.startswith(b"\x89PNG\r\n\x1a\n"):
        return "image/png"
    if data.startswith(b"\xff\xd8\xff"):
        return "image/jpeg"
    if data.startswith((b"GIF87a", b"GIF89a")):
        return "image/gif"
    if len(data) >= 12 and data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return "image/webp"
    return None


class BoundedWriter:
    """Keeps at most `limit` characters of user output."""

    def __init__(self, limit: int) -> None:
        self.limit = limit
        self.parts: list[str] = []
        self.size = 0
        self.truncated = False

    def write(self, text: str) -> int:
        if not text:
            return 0
        if self.size >= self.limit:
            self.truncated = True
            return len(text)
        room = self.limit - self.size
        chunk = text[:room]
        self.parts.append(chunk)
        self.size += len(chunk)
        if len(chunk) < len(text):
            self.truncated = True
        return len(text)

    def flush(self) -> None:
        pass

    def text(self) -> str:
        value = "".join(self.parts)
        if self.truncated:
            value += "\n[输出过长，已截断]"
        return value


def normalize_path(value: object) -> str | None:
    if not isinstance(value, str):
        return None
    path = value.strip().removeprefix("./")
    if path == "" or len(path) > 200:
        return None
    if path.startswith("/") or "\\" in path:
        return None
    for char in path:
        code = ord(char)
        if code < 32 or code == 127:
            return None
    parts = path.split("/")
    if any(part in ("", ".", "..") for part in parts):
        return None
    return path


def sanitize_files(raw: object) -> dict[str, str]:
    if not isinstance(raw, dict):
        return {}
    files: dict[str, str] = {}
    total = 0
    for key, value in list(raw.items())[:MAX_FILES]:
        path = normalize_path(key)
        if not path or not isinstance(value, str):
            continue
        content = value[:MAX_FILE_CHARS]
        total += len(content)
        if total > MAX_TOTAL_CHARS:
            break
        files[path] = content
    return files


def inside_root(path: str) -> bool:
    root = os.path.realpath(ROOT)
    target = os.path.realpath(path)
    return target == root or target.startswith(root + os.sep)


def materialize(files: dict[str, str]) -> None:
    shutil.rmtree(ROOT, ignore_errors=True)
    os.makedirs(ROOT, exist_ok=True)


def collect_outputs() -> tuple[dict[str, str], list[dict]]:
    """Split the sandbox directory into text files and binary image artifacts.

    Raster images cannot live in the text snapshot (it is re-sent with every
    request), so they travel once in the run response and the client uploads
    them to PocketBase. Everything else that decodes as UTF-8 is a text file.
    """
    files: dict[str, str] = {}
    artifacts: list[dict] = []
    text_total = 0
    artifact_total = 0
    for base, dirs, names in os.walk(ROOT, followlinks=False):
        dirs[:] = [
            name
            for name in dirs
            if not os.path.islink(os.path.join(base, name))
        ]
        for name in names:
            full = os.path.join(base, name)
            if os.path.islink(full) or not inside_root(full):
                continue
            path = os.path.relpath(full, ROOT)
            try:
                with open(full, "rb") as handle:
                    raw = handle.read(MAX_ARTIFACT_BYTES + 1)
            except OSError:
                continue
            mime = sniff_image_mime(raw[:16])
            if mime:
                if len(raw) > MAX_ARTIFACT_BYTES:
                    continue
                if len(artifacts) >= MAX_ARTIFACTS:
                    continue
                if artifact_total + len(raw) > MAX_ARTIFACT_TOTAL_BYTES:
                    continue
                artifact_total += len(raw)
                artifacts.append(
                    {
                        "path": path,
                        "mime": mime,
                        "bytes": len(raw),
                        "data": base64.b64encode(raw).decode("ascii"),
                    }
                )
                continue
            if len(files) >= MAX_FILES:
                continue
            try:
                content = raw.decode("utf-8")
            except UnicodeDecodeError:
                continue
            content = content[:MAX_FILE_CHARS]
            text_total += len(content)
            if text_total > MAX_TOTAL_CHARS:
                continue
            files[path] = content
    return files, artifacts


def collect_files() -> dict[str, str]:
    return collect_outputs()[0]


def write_files(files: dict[str, str]) -> None:
    for path, content in files.items():
        full = os.path.join(ROOT, path)
        os.makedirs(os.path.dirname(full) or ROOT, exist_ok=True)
        with open(full, "w", encoding="utf-8") as handle:
            handle.write(content)


class Sandbox:
    """Helpers exposed to user code as `sandbox`."""

    def _path(self, path: object) -> str:
        clean = normalize_path(path)
        if not clean:
            raise ValueError("文件路径不合法")
        full = os.path.join(ROOT, clean)
        if not inside_root(full):
            raise ValueError("文件路径不合法")
        return full

    def read(self, path: object) -> str | None:
        full = self._path(path)
        try:
            with open(full, "r", encoding="utf-8") as handle:
                return handle.read(MAX_FILE_CHARS)
        except FileNotFoundError:
            return None

    def write(self, path: object, content: object) -> int:
        full = self._path(path)
        text = content if isinstance(content, str) else str(content)
        if len(text) > MAX_FILE_CHARS:
            raise ValueError(f"单个文件最多 {MAX_FILE_CHARS} 个字符")
        os.makedirs(os.path.dirname(full) or ROOT, exist_ok=True)
        with open(full, "w", encoding="utf-8") as handle:
            handle.write(text)
        return len(text)

    def list(self) -> list[str]:
        return sorted(collect_files().keys())

    def remove(self, path: object) -> bool:
        full = self._path(path)
        try:
            os.remove(full)
            return True
        except FileNotFoundError:
            return False

    def fetch(self, url: object, timeout: object = 15) -> str:
        """Fetch an HTTP(S) URL and return its body as text."""
        if not isinstance(url, str) or not url.startswith(
            ("http://", "https://")
        ):
            raise ValueError("只支持 http/https")
        seconds = 15.0
        try:
            seconds = min(max(float(timeout), 1.0), 20.0)
        except (TypeError, ValueError):
            pass
        request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
        with urllib.request.urlopen(request, timeout=seconds) as response:
            return response.read(2 * MAX_FILE_CHARS).decode("utf-8", "replace")

    def download(
        self, url: object, path: object, timeout: object = 15
    ) -> dict:
        """Download a public URL as bytes (images) into the sandbox."""
        full = self._path(path)
        if not isinstance(url, str) or not url.startswith(
            ("http://", "https://")
        ):
            raise ValueError("只支持 http/https")
        seconds = 15.0
        try:
            seconds = min(max(float(timeout), 1.0), 20.0)
        except (TypeError, ValueError):
            pass
        request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
        with urllib.request.urlopen(request, timeout=seconds) as response:
            data = response.read(MAX_ARTIFACT_BYTES + 1)
        if len(data) > MAX_ARTIFACT_BYTES:
            raise ValueError(
                f"文件太大（最多 {MAX_ARTIFACT_BYTES} 字节）"
            )
        if not data:
            raise ValueError("下载到的内容是空的")
        os.makedirs(os.path.dirname(full) or ROOT, exist_ok=True)
        with open(full, "wb") as handle:
            handle.write(data)
        return {"path": normalize_path(path), "size": len(data)}


def serialize_result(value: object) -> object:
    try:
        text = json.dumps(value, ensure_ascii=False, default=str)
    except (TypeError, ValueError):
        text = json.dumps(str(value), ensure_ascii=False)
    if len(text) > MAX_RESULT_CHARS:
        return text[:MAX_RESULT_CHARS] + "…"
    try:
        return json.loads(text)
    except ValueError:
        return text


def respond(payload: dict) -> None:
    sys.stdout.write(json.dumps(payload, ensure_ascii=False))
    sys.stdout.flush()


def run(request: dict) -> dict:
    started = time.monotonic()
    files = sanitize_files(request.get("files"))
    op = request.get("op")
    response = {
        "ok": False,
        "result": None,
        "logs": [],
        "files": files,
        "artifacts": [],
        "durationMs": 0,
    }

    try:
        if op == "list":
            response.update(
                ok=True,
                result=sorted(files.keys()),
                files=files,
            )
        elif op == "read":
            path = normalize_path(request.get("path"))
            if not path:
                raise ValueError("文件路径不合法")
            response.update(ok=True, result=files.get(path), files=files)
        elif op == "write":
            path = normalize_path(request.get("path"))
            content = request.get("content")
            if not path:
                raise ValueError("文件路径不合法")
            if not isinstance(content, str):
                raise ValueError("文件内容必须是字符串")
            # append lets a long file be written in chunks (the model's
            # output per round is capped); a missing file is created.
            existing = files.get(path)
            if request.get("append") is True and isinstance(existing, str):
                content = existing + content
            if len(content) > MAX_FILE_CHARS:
                raise ValueError(f"单个文件最多 {MAX_FILE_CHARS} 个字符")
            next_files = dict(files)
            next_files[path] = content
            total = sum(len(value) for value in next_files.values())
            if len(next_files) > MAX_FILES or total > MAX_TOTAL_CHARS:
                raise ValueError("沙箱文件总量超出上限")
            response.update(
                ok=True,
                result={"path": path, "size": len(content)},
                files=next_files,
            )
        elif op == "run":
            code = request.get("code")
            if not isinstance(code, str) or not code.strip():
                raise ValueError("缺少要运行的代码")
            materialize(files)
            write_files(files)
            os.chdir(ROOT)
            stdout = BoundedWriter(MAX_LOG_CHARS)
            stderr = BoundedWriter(MAX_LOG_CHARS)
            namespace = {
                "__name__": "__sandbox__",
                "sandbox": Sandbox(),
                "result": None,
            }
            error = None
            with contextlib.redirect_stdout(stdout), contextlib.redirect_stderr(
                stderr
            ):
                try:
                    exec(compile(code, "<sandbox>", "exec"), namespace, namespace)
                except SystemExit:
                    pass
                except BaseException:
                    lines = traceback.format_exc().strip().splitlines()
                    error = (lines[-1] if lines else "执行出错")[:500]
            collected, artifacts = collect_outputs()
            logs = stdout.text().splitlines() if stdout.text() else []
            if stderr.text():
                logs.extend(
                    "[stderr] " + line for line in stderr.text().splitlines()
                )
            response.update(
                ok=error is None,
                result=serialize_result(namespace.get("result")),
                logs=logs[:MAX_LOG_LINES],
                files=collected,
                artifacts=artifacts,
                **({"error": error} if error else {}),
            )
        else:
            raise ValueError("未知操作")
    except ValueError as error:
        response["error"] = str(error)[:500]
    except Exception:
        lines = traceback.format_exc().strip().splitlines()
        response["error"] = (lines[-1] if lines else "沙箱运行出错")[:500]
    finally:
        shutil.rmtree(ROOT, ignore_errors=True)

    response["durationMs"] = int((time.monotonic() - started) * 1000)
    return response


def main() -> None:
    try:
        request = json.load(sys.stdin)
        if not isinstance(request, dict):
            raise ValueError
    except Exception:
        respond(
            {
                "ok": False,
                "result": None,
                "logs": [],
                "files": {},
                "artifacts": [],
                "error": "请求不是合法的 JSON",
                "durationMs": 0,
            }
        )
        return
    respond(run(request))


if __name__ == "__main__":
    main()
