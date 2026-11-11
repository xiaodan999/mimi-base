/**
 * Video compression -> smaller MP4 (Bun API).
 *
 * `POST /api/video/compress` receives the original video from the post
 * composer, authenticates the caller with their PocketBase token, and returns
 * a resized/re-encoded MP4. The browser then uploads *that* file to
 * PocketBase, so the stored copy is small from the first view; the original
 * never touches `pb_data`.
 *
 * ffmpeg is an optional server dependency. If it is missing, the endpoint
 * answers 503 `{ reason: "ffmpeg_missing" }` and the client submits the
 * original file instead — a missing encoder never loses a post. The same
 * fallback applies when compression fails or the result is not smaller.
 */
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

export const VIDEO_COMPRESS_PATH = "/api/video/compress";

const MAX_VIDEO_BYTES = 50 * 1024 * 1024;
/** Multipart overhead allowance on top of the video itself. */
const MAX_BODY_BYTES = MAX_VIDEO_BYTES + 1024 * 1024;
const AUTH_CACHE_MS = 60_000;
const AUTH_CACHE_MAX = 500;
const FFMPEG_TIMEOUT_MS = 240_000;

const ALLOWED_TYPES = new Set(["video/mp4", "video/webm", "video/quicktime"]);
const ALLOWED_EXTENSIONS = new Set(["mp4", "webm", "mov"]);

const CORS_HEADERS: Record<string, string> = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Authorization, Content-Type",
    "Access-Control-Expose-Headers": "X-Video-Compressed",
    "Access-Control-Max-Age": "600",
};

export type VideoCompressResult =
    { ok: true } | { ok: false; missing: boolean; error: string };

export type VideoCompressDeps = {
    /** Loopback PocketBase base URL, e.g. http://127.0.0.1:8090 */
    pbBaseUrl: string;
    /** Path/name of the ffmpeg binary; defaults to `ffmpeg` on PATH. */
    ffmpegPath?: string;
    /** Injectable for tests. */
    fetch?: typeof fetch;
    now?: () => number;
    authCacheMs?: number;
    /** Injectable temp root; defaults to the OS temp directory. */
    tmpDir?: string;
    /** Injectable compressor; defaults to spawning ffmpeg. */
    compress?: (
        inputPath: string,
        outputPath: string,
    ) => Promise<VideoCompressResult>;
};

export type VideoService = (req: Request) => Promise<Response | null>;

type AuthOk = { ok: true; token: string };
type AuthFail = { ok: false; response: Response };

function json(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), {
        status,
        headers: { ...CORS_HEADERS, "content-type": "application/json" },
    });
}

function empty(status: number): Response {
    return new Response(null, { status, headers: CORS_HEADERS });
}

function badRequest(message: string): Response {
    return json({ ok: false, error: message }, 400);
}

function unauthorized(): Response {
    return json({ ok: false, error: "登录已过期，请重新登录" }, 401);
}

function isMissingError(error: unknown): boolean {
    return (
        error instanceof Error &&
        /ENOENT|no such file|not found/i.test(error.message)
    );
}

function hasVideoExtension(name: string): boolean {
    const match = /\.([^.\\/]+)$/.exec(name.trim());
    return Boolean(match && ALLOWED_EXTENSIONS.has(match[1].toLowerCase()));
}

function isAllowedVideo(file: File): boolean {
    const type = file.type.toLowerCase();
    return ALLOWED_TYPES.has(type) || hasVideoExtension(file.name);
}

/** Default compressor: H.264/AAC MP4, bounded to 1280px and a sane bitrate. */
function createFfmpegRunner(
    ffmpegPath: string,
): (inputPath: string, outputPath: string) => Promise<VideoCompressResult> {
    return async (inputPath, outputPath) => {
        try {
            const proc = Bun.spawn(
                [
                    ffmpegPath,
                    "-hide_banner",
                    "-loglevel",
                    "error",
                    "-y",
                    "-i",
                    inputPath,
                    "-map",
                    "0:v:0",
                    "-map",
                    "0:a:0?",
                    "-vf",
                    "scale=w='min(1280,iw)':h='min(1280,ih)':force_original_aspect_ratio=decrease:force_divisible_by=2",
                    "-c:v",
                    "libx264",
                    "-preset",
                    "veryfast",
                    "-crf",
                    "26",
                    "-maxrate",
                    "2500k",
                    "-bufsize",
                    "5000k",
                    "-pix_fmt",
                    "yuv420p",
                    "-c:a",
                    "aac",
                    "-b:a",
                    "96k",
                    "-movflags",
                    "+faststart",
                    outputPath,
                ],
                {
                    stdin: "ignore",
                    stdout: "ignore",
                    stderr: "pipe",
                },
            );
            const stderrPromise = new Response(proc.stderr).text();
            const timer = setTimeout(() => {
                try {
                    proc.kill();
                } catch {
                    // already exited
                }
            }, FFMPEG_TIMEOUT_MS);
            try {
                const [code, stderr] = await Promise.all([
                    proc.exited,
                    stderrPromise,
                ]);
                if (code === 0) return { ok: true };
                return {
                    ok: false,
                    missing: /ENOENT|no such file|not found/i.test(stderr),
                    error:
                        stderr.trim().slice(0, 500) ||
                        `ffmpeg exited with code ${code}`,
                };
            } finally {
                clearTimeout(timer);
            }
        } catch (error) {
            return {
                ok: false,
                missing: isMissingError(error),
                error:
                    error instanceof Error
                        ? error.message.slice(0, 500)
                        : "无法启动 ffmpeg",
            };
        }
    };
}

/**
 * Build the video compression handler. Returns `null` for paths it does not
 * own, so server.ts can mount it next to the AI relay and feedback service.
 */
export function createVideoService(deps: VideoCompressDeps): VideoService {
    const fetchImpl = deps.fetch ?? fetch;
    const now = deps.now ?? Date.now;
    const authCacheMs = deps.authCacheMs ?? AUTH_CACHE_MS;
    const authCache = new Map<string, { expiresAt: number }>();
    const compress =
        deps.compress ??
        createFfmpegRunner(deps.ffmpegPath?.trim() || "ffmpeg");
    let ffmpegUnavailable = false;

    async function authenticate(req: Request): Promise<AuthOk | AuthFail> {
        const header = req.headers.get("authorization")?.trim() ?? "";
        const token = header.replace(/^bearer\s+/i, "").trim();
        if (!token) return { ok: false, response: unauthorized() };

        const cached = authCache.get(token);
        if (cached && now() < cached.expiresAt) {
            return { ok: true, token };
        }

        let res: Response;
        try {
            res = await fetchImpl(
                `${deps.pbBaseUrl}/api/collections/users/auth-refresh`,
                {
                    method: "POST",
                    headers: { Authorization: token },
                    signal: AbortSignal.timeout(5_000),
                },
            );
        } catch {
            return {
                ok: false,
                response: json({ ok: false, error: "无法验证登录状态" }, 503),
            };
        }
        if (res.status === 401 || res.status === 403) {
            authCache.delete(token);
            return { ok: false, response: unauthorized() };
        }
        if (!res.ok) {
            return {
                ok: false,
                response: json({ ok: false, error: "视频服务暂时不可用" }, 503),
            };
        }

        if (authCache.size >= AUTH_CACHE_MAX) authCache.clear();
        authCache.set(token, { expiresAt: now() + authCacheMs });
        return { ok: true, token };
    }

    async function handle(req: Request): Promise<Response> {
        const declared = Number(req.headers.get("content-length") ?? 0);
        if (declared > MAX_BODY_BYTES) {
            return json({ ok: false, error: "视频不能超过 50MB" }, 413);
        }

        const auth = await authenticate(req);
        if (!auth.ok) return auth.response;

        let form: FormData;
        try {
            form = await req.formData();
        } catch {
            return badRequest("请求内容不是合法的表单");
        }
        const file = form.get("file");
        if (!(file instanceof File) || file.size === 0) {
            return badRequest("没有收到视频");
        }
        if (file.size > MAX_VIDEO_BYTES) {
            return json({ ok: false, error: "视频不能超过 50MB" }, 413);
        }
        if (!isAllowedVideo(file)) {
            return badRequest("只支持 MP4、WebM 或 MOV 视频");
        }
        if (ffmpegUnavailable) {
            return json(
                {
                    ok: false,
                    reason: "ffmpeg_missing",
                    error: "服务器还没有安装 ffmpeg",
                },
                503,
            );
        }

        let dir = "";
        try {
            dir = await mkdtemp(
                path.join(deps.tmpDir ?? tmpdir(), "mimi-video-"),
            );
            const inputPath = path.join(dir, "input");
            const outputPath = path.join(dir, "output.mp4");
            await writeFile(
                inputPath,
                new Uint8Array(await file.arrayBuffer()),
            );

            const result = await compress(inputPath, outputPath);
            if (!result.ok) {
                if (result.missing) ffmpegUnavailable = true;
                return json(
                    {
                        ok: false,
                        reason: result.missing
                            ? "ffmpeg_missing"
                            : "compress_failed",
                        error: result.missing
                            ? "服务器还没有安装 ffmpeg"
                            : "视频压缩失败",
                    },
                    result.missing ? 503 : 502,
                );
            }

            const output = await readFile(outputPath);
            if (output.byteLength === 0) {
                return json(
                    {
                        ok: false,
                        reason: "compress_failed",
                        error: "视频压缩失败",
                    },
                    502,
                );
            }
            if (output.byteLength >= file.size) {
                // Keeping the original is better than replacing it with a
                // same-size (or larger) file. 204 means "no new file".
                return new Response(null, {
                    status: 204,
                    headers: {
                        ...CORS_HEADERS,
                        "X-Video-Compressed": "0",
                    },
                });
            }
            return new Response(new Uint8Array(output), {
                status: 200,
                headers: {
                    ...CORS_HEADERS,
                    "content-type": "video/mp4",
                    "content-length": String(output.byteLength),
                    "cache-control": "no-store",
                    "X-Video-Compressed": "1",
                },
            });
        } catch {
            return json(
                {
                    ok: false,
                    reason: "compress_failed",
                    error: "视频压缩失败",
                },
                502,
            );
        } finally {
            if (dir) await rm(dir, { recursive: true, force: true });
        }
    }

    return async function handleVideo(req: Request): Promise<Response | null> {
        const url = new URL(req.url);
        if (url.pathname !== VIDEO_COMPRESS_PATH) return null;
        if (req.method === "OPTIONS") return empty(204);
        if (req.method !== "POST") {
            return json({ ok: false, error: "method not allowed" }, 405);
        }
        return handle(req);
    };
}
