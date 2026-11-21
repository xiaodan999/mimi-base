/**
 * Video compression -> smaller MP4 (Bun API).
 *
 * `POST /api/video/compress` receives the original video from the post
 * composer and returns a resized/re-encoded MP4. The browser then uploads
 * *that* file to PocketBase, so the stored copy is small from the first view;
 * the original never touches `pb_data`.
 *
 * ffmpeg is an optional server dependency. If it is missing, the endpoint
 * answers 503 `{ reason: "ffmpeg_missing" }` and the client submits the
 * original file instead — a missing encoder never loses a post. The same
 * fallback applies when compression fails or the result is not smaller.
 *
 * Auth, the body cap and CORS live in `server/http/*`; this module only owns
 * the compression pipeline. At most two compressions run at a time, and only a
 * spawn failure disables ffmpeg (a malformed MP4 must not poison the service).
 */

import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import type { AuthUser } from "./http/auth";
import { HttpError } from "./http/errors";
import { bytesResponse, emptyResponse } from "./http/response";

export const VIDEO_COMPRESS_PATH = "/api/video/compress";

const MAX_VIDEO_BYTES = 50 * 1024 * 1024;
const FFMPEG_TIMEOUT_MS = 240_000;

const ALLOWED_TYPES = new Set(["video/mp4", "video/webm", "video/quicktime"]);
const ALLOWED_EXTENSIONS = new Set(["mp4", "webm", "mov"]);

export type VideoCompressResult =
    { ok: true } | { ok: false; missing: boolean; error: string };

export type VideoCompressDeps = {
    /** Path/name of the ffmpeg binary; defaults to `ffmpeg` on PATH. */
    ffmpegPath?: string;
    /** Injectable temp root; defaults to the OS temp directory. */
    tmpDir?: string;
    /** Maximum concurrent compressions; defaults to 2. */
    maxInFlight?: number;
    /** Injectable compressor; defaults to spawning ffmpeg. */
    compress?: (
        inputPath: string,
        outputPath: string,
    ) => Promise<VideoCompressResult>;
};

export type VideoService = {
    compress(
        request: Request,
        auth: AuthUser,
        form: FormData,
    ): Promise<Response>;
};

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
                // A malformed video prints "moov atom not found" and exits
                // non-zero. That is not a missing binary; only a spawn
                // failure (handled below) may disable the service.
                return {
                    ok: false,
                    missing: false,
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

export function createVideoService(deps: VideoCompressDeps): VideoService {
    const compress =
        deps.compress ??
        createFfmpegRunner(deps.ffmpegPath?.trim() || "ffmpeg");
    const maxInFlight = Math.max(1, deps.maxInFlight ?? 2);
    let inFlight = 0;
    let ffmpegUnavailable = false;

    async function compressRequest(
        request: Request,
        form: FormData,
    ): Promise<Response> {
        if (ffmpegUnavailable) {
            throw new HttpError(503, "服务器还没有安装 ffmpeg", {
                code: "ffmpeg_missing",
                details: { ok: false, reason: "ffmpeg_missing" },
            });
        }
        if (inFlight >= maxInFlight) {
            throw new HttpError(429, "视频压缩忙不过来，稍后再试", {
                code: "rate_limited",
            });
        }

        // Reserve the slot before using the parsed body: a 50 MB upload
        // buffered for a compressor that will immediately reject is wasteful.
        inFlight += 1;
        let dir = "";
        try {
            const file = form.get("file");
            if (!(file instanceof File) || file.size === 0) {
                throw new HttpError(400, "没有收到视频", {
                    code: "invalid_body",
                });
            }
            if (file.size > MAX_VIDEO_BYTES) {
                throw new HttpError(413, "视频不能超过 50MB", {
                    code: "payload_too_large",
                });
            }
            if (!isAllowedVideo(file)) {
                throw new HttpError(400, "只支持 MP4、WebM 或 MOV 视频", {
                    code: "unsupported_video",
                });
            }

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
                throw new HttpError(
                    result.missing ? 503 : 502,
                    result.missing ? "服务器还没有安装 ffmpeg" : "视频压缩失败",
                    {
                        code: result.missing
                            ? "ffmpeg_missing"
                            : "compress_failed",
                        details: {
                            ok: false,
                            reason: result.missing
                                ? "ffmpeg_missing"
                                : "compress_failed",
                        },
                    },
                );
            }

            const output = await readFile(outputPath);
            if (output.byteLength === 0) {
                throw new HttpError(502, "视频压缩失败", {
                    code: "compress_failed",
                    details: {
                        ok: false,
                        reason: "compress_failed",
                    },
                });
            }
            if (output.byteLength >= file.size) {
                // Keeping the original is better than replacing it with a
                // same-size (or larger) file. 204 means "no new file".
                return emptyResponse(request, 204, {
                    "X-Video-Compressed": "0",
                });
            }
            return bytesResponse(request, new Uint8Array(output), {
                contentType: "video/mp4",
                headers: {
                    "cache-control": "no-store",
                    "X-Video-Compressed": "1",
                },
            });
        } catch (error) {
            if (error instanceof HttpError) throw error;
            throw new HttpError(502, "视频压缩失败", {
                code: "compress_failed",
                details: { ok: false, reason: "compress_failed" },
            });
        } finally {
            inFlight -= 1;
            if (dir) await rm(dir, { recursive: true, force: true });
        }
    }

    return {
        compress(request, auth, form) {
            void auth;
            return compressRequest(request, form);
        },
    };
}
