/// <reference lib="webworker" />
/**
 * QuickJS sandbox worker.
 *
 * Runs one sandbox request in its own Worker so the API can hard-terminate a
 * runaway script. The VM has no filesystem, no network and no host globals;
 * the only bridge is the `sandbox` object and `console`. Multi-megabyte
 * downloads stay on the host and are returned as one-shot artifacts.
 *
 * `sandbox.fetch` / `sandbox.download` return a QuickJS Promise bridged from
 * the native fetch (see sandbox-promise.ts) instead of using an asyncified
 * host function. Asyncify traps on the second successful call in one run, and
 * its interrupt handler is unreliable for a hot loop, so the parent's
 * `worker.terminate()` at SANDBOX_TIMEOUT_MS is the real time limit.
 */

import {
    newQuickJSAsyncWASMModule,
    type QuickJSAsyncContext,
    type QuickJSAsyncRuntime,
    RELEASE_ASYNC,
} from "quickjs-emscripten";

import {
    MAX_ARTIFACT_BYTES,
    MAX_ARTIFACT_TOTAL_BYTES,
    MAX_FILE_CHARS,
    MAX_FILES,
    MAX_LOG_LINES,
    MAX_OUTPUT_CHARS,
    MAX_TOTAL_CHARS,
    normalizeSandboxPath,
    type SandboxArtifact,
    type SandboxFiles,
    sanitizeFiles,
} from "../lib/sandbox-protocol";
import { fetchPublic } from "./safe-fetch";
import { hostPromise } from "./sandbox-promise";

declare var self: Worker;

type WorkerRequest = {
    code: string;
    files: Record<string, string>;
};

type WorkerResult = {
    result: unknown;
    logs: string[];
    files: SandboxFiles;
    artifacts: SandboxArtifact[];
    error?: string;
    durationMs: number;
};

const MAX_LOG_CHARS = 20_000;
const FETCH_TIMEOUT_MS = 15_000;
const MAX_FETCH_CHARS = 2 * MAX_FILE_CHARS;
const MEMORY_LIMIT = 64 * 1024 * 1024;
const MAX_STACK_SIZE = 512 * 1024;
/** Leave room for the parent's kill timer. */
const DRIVER_TIMEOUT_MS = 58_000;

const PNG_MAGIC = new Uint8Array([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
]);

/** Only raster images the app renders in an `<img>`; SVG stays text. */
function sniffImageMime(data: Uint8Array): SandboxArtifact["mime"] | null {
    if (
        data.length >= 8 &&
        data.slice(0, 8).every((byte, index) => byte === PNG_MAGIC[index])
    ) {
        return "image/png";
    }
    if (data.length >= 3 && data[0] === 0xff && data[1] === 0xd8) {
        return "image/jpeg";
    }
    const head = String.fromCharCode(...data.slice(0, 6));
    if (head === "GIF87a" || head === "GIF89a") return "image/gif";
    if (
        data.length >= 12 &&
        String.fromCharCode(...data.slice(0, 4)) === "RIFF" &&
        String.fromCharCode(...data.slice(8, 12)) === "WEBP"
    ) {
        return "image/webp";
    }
    return null;
}

function renderLog(value: unknown): string {
    if (typeof value === "string") return value;
    try {
        const text = JSON.stringify(value);
        return text === undefined ? String(value) : text;
    } catch {
        return String(value);
    }
}

function errorText(value: unknown): string {
    if (typeof value === "string") return value.slice(0, 500);
    if (value && typeof value === "object" && "message" in value) {
        return String((value as { message: unknown }).message).slice(0, 500);
    }
    return String(value).slice(0, 500);
}

function serializeResult(value: unknown): unknown {
    if (value === undefined) return null;
    try {
        const text = JSON.stringify(value, (_, item) =>
            typeof item === "bigint" ? `${item}n` : item,
        );
        if (text === undefined) return null;
        if (text.length > MAX_OUTPUT_CHARS) {
            return `${text.slice(0, MAX_OUTPUT_CHARS)}…`;
        }
        return JSON.parse(text);
    } catch {
        return String(value).slice(0, MAX_OUTPUT_CHARS);
    }
}

async function execute(request: WorkerRequest): Promise<WorkerResult> {
    const started = Date.now();
    const textFiles = new Map(Object.entries(sanitizeFiles(request.files)));
    const binaries = new Map<
        string,
        { mime: SandboxArtifact["mime"]; bytes: Uint8Array }
    >();
    const logs: string[] = [];
    let logChars = 0;
    let logLines = 0;

    const pushLog = (kind: string, args: unknown[]) => {
        if (logLines >= MAX_LOG_LINES || logChars >= MAX_LOG_CHARS) return;
        const line = args.map(renderLog).join(" ");
        const text = kind === "log" ? line : `[${kind}] ${line}`;
        const remaining = MAX_LOG_CHARS - logChars;
        if (remaining <= 0) return;
        const piece = text.slice(0, remaining);
        logChars += piece.length;
        logLines += 1;
        logs.push(piece);
    };

    const QuickJS = await newQuickJSAsyncWASMModule(RELEASE_ASYNC);
    const runtime: QuickJSAsyncRuntime = QuickJS.newRuntime();
    runtime.setMemoryLimit(MEMORY_LIMIT);
    runtime.setMaxStackSize(MAX_STACK_SIZE);
    const vm: QuickJSAsyncContext = runtime.newContext();

    let error = "";

    try {
        const consoleObject = vm.newObject();
        for (const name of ["log", "info", "debug", "warn", "error"] as const) {
            const fn = vm.newFunction(name, (...args) => {
                pushLog(
                    name,
                    args.map((arg) => vm.dump(arg)),
                );
            });
            vm.setProp(consoleObject, name, fn);
            fn.dispose();
        }
        vm.setProp(vm.global, "console", consoleObject);
        consoleObject.dispose();

        const sandbox = vm.newObject();

        const readFn = vm.newFunction("read", (pathHandle) => {
            const path = normalizeSandboxPath(vm.getString(pathHandle));
            if (!path) throw new Error("文件路径不合法");
            const value = textFiles.get(path);
            return value === undefined ? vm.null : vm.newString(value);
        });
        vm.setProp(sandbox, "read", readFn);
        readFn.dispose();

        const writeFn = vm.newFunction("write", (pathHandle, contentHandle) => {
            const path = normalizeSandboxPath(vm.getString(pathHandle));
            if (!path) throw new Error("文件路径不合法");
            const content = vm.getString(contentHandle);
            if (content.length > MAX_FILE_CHARS) {
                throw new Error(`单个文件最多 ${MAX_FILE_CHARS} 个字符`);
            }
            let total = content.length;
            for (const [key, value] of textFiles) {
                if (key !== path) total += value.length;
            }
            if (
                (!textFiles.has(path) && textFiles.size >= MAX_FILES) ||
                total > MAX_TOTAL_CHARS
            ) {
                throw new Error("沙箱文件总量超出上限");
            }
            textFiles.set(path, content);
            return vm.newNumber(content.length);
        });
        vm.setProp(sandbox, "write", writeFn);
        writeFn.dispose();

        const listFn = vm.newFunction("list", () => {
            const array = vm.newArray();
            [...textFiles.keys()].sort().forEach((key, index) => {
                const handle = vm.newString(key);
                vm.setProp(array, index, handle);
                handle.dispose();
            });
            return array;
        });
        vm.setProp(sandbox, "list", listFn);
        listFn.dispose();

        const removeFn = vm.newFunction("remove", (pathHandle) => {
            const path = normalizeSandboxPath(vm.getString(pathHandle));
            if (!path) throw new Error("文件路径不合法");
            return textFiles.delete(path) ? vm.true : vm.false;
        });
        vm.setProp(sandbox, "remove", removeFn);
        removeFn.dispose();

        const fetchFn = vm.newFunction("fetch", (urlHandle) => {
            const url = vm.getString(urlHandle);
            return hostPromise(vm, async () => {
                const result = await fetchPublic(url, {
                    maxBytes: MAX_FETCH_CHARS,
                    timeoutMs: FETCH_TIMEOUT_MS,
                    headers: {
                        Accept: "text/*, application/json;q=0.9, */*;q=0.5",
                    },
                });
                if (result.kind !== "text") throw new Error("只能读取文本内容");
                return vm.newString(result.body);
            });
        });
        vm.setProp(sandbox, "fetch", fetchFn);
        fetchFn.dispose();

        const downloadFn = vm.newFunction(
            "download",
            (urlHandle, pathHandle) => {
                const url = vm.getString(urlHandle);
                const path = normalizeSandboxPath(vm.getString(pathHandle));
                if (!path) throw new Error("文件路径不合法");
                return hostPromise(vm, async () => {
                    const result = await fetchPublic(url, {
                        maxBytes: MAX_ARTIFACT_BYTES,
                        timeoutMs: FETCH_TIMEOUT_MS,
                        binary: true,
                    });
                    if (result.kind !== "bytes") throw new Error("下载失败");
                    const mime = sniffImageMime(result.body);
                    if (!mime) {
                        throw new Error("只支持 PNG/JPEG/WebP/GIF 图片");
                    }
                    if (result.body.length === 0) {
                        throw new Error("下载到的内容是空的");
                    }
                    let total = 0;
                    for (const item of binaries.values())
                        total += item.bytes.length;
                    if (
                        (!binaries.has(path) && binaries.size >= 3) ||
                        total + result.body.length > MAX_ARTIFACT_TOTAL_BYTES ||
                        result.body.length > MAX_ARTIFACT_BYTES
                    ) {
                        throw new Error("下载的图片太多了");
                    }
                    textFiles.delete(path);
                    binaries.set(path, { mime, bytes: result.body });
                    const object = vm.newObject();
                    const pathProp = vm.newString(path);
                    vm.setProp(object, "path", pathProp);
                    pathProp.dispose();
                    const sizeProp = vm.newNumber(result.body.length);
                    vm.setProp(object, "size", sizeProp);
                    sizeProp.dispose();
                    return object;
                });
            },
        );
        vm.setProp(sandbox, "download", downloadFn);
        downloadFn.dispose();

        vm.setProp(vm.global, "sandbox", sandbox);
        sandbox.dispose();

        const wrapper = `
            globalThis.result = undefined;
            globalThis.__mimi_error = undefined;
            (async () => {
${request.code}
            })().then(
                (value) => { if (value !== undefined) globalThis.result = value; },
                (caught) => {
                    globalThis.__mimi_error =
                        (caught && (caught.message || String(caught))) || "执行失败";
                }
            );
        `;

        const evaluated = await vm.evalCodeAsync(wrapper, "sandbox.js");
        if (evaluated.error) {
            error = errorText(vm.dump(evaluated.error));
            evaluated.error.dispose();
        } else if (evaluated.value) {
            const settled = vm.resolvePromise(evaluated.value);
            const deadline = Date.now() + DRIVER_TIMEOUT_MS;
            let outcome: { value?: unknown; error?: unknown } | null = null;
            for (;;) {
                const jobs = runtime.executePendingJobs();
                if (jobs.alive) jobs.dispose();
                const raced = await Promise.race([
                    settled.then(
                        (value) => ({ value }),
                        (caught) => ({ error: caught }),
                    ),
                    new Promise<null>((resolve) =>
                        setTimeout(() => resolve(null), 20),
                    ),
                ]);
                if (raced) {
                    outcome = raced;
                    break;
                }
                if (Date.now() > deadline) break;
            }
            if (!outcome) {
                error = "沙箱执行超时";
            } else if ("error" in outcome && outcome.error) {
                error = errorText(outcome.error);
            }
            evaluated.value.dispose();
        }

        const errorHandle = vm.getProp(vm.global, "__mimi_error");
        const reported = vm.dump(errorHandle);
        errorHandle.dispose();
        if (typeof reported === "string" && reported !== "") {
            error = reported.slice(0, 500);
        }

        const resultHandle = vm.getProp(vm.global, "result");
        const value = serializeResult(vm.dump(resultHandle));
        resultHandle.dispose();

        const files: SandboxFiles = {};
        for (const [key, content] of textFiles) files[key] = content;

        const artifacts: SandboxArtifact[] = [];
        for (const [path, item] of binaries) {
            artifacts.push({
                path,
                mime: item.mime,
                bytes: item.bytes.length,
                data: Buffer.from(item.bytes).toString("base64"),
            });
        }

        return {
            result: value,
            logs,
            files,
            artifacts,
            ...(error ? { error } : {}),
            durationMs: Date.now() - started,
        };
    } finally {
        try {
            vm.dispose();
        } catch {
            // The runtime may already be poisoned after an OOM.
        }
        try {
            runtime.dispose();
        } catch {
            // ignore
        }
    }
}

self.onmessage = async (event: MessageEvent<WorkerRequest>) => {
    try {
        const response = await execute(event.data);
        self.postMessage(response);
    } catch (caught) {
        self.postMessage({
            result: null,
            logs: [],
            files: {},
            artifacts: [],
            error: errorText(caught) || "沙箱执行失败",
            durationMs: 0,
        } satisfies WorkerResult);
    }
};
