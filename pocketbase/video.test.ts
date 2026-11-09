import { describe, expect, test } from "bun:test";
import { tmpdir } from "node:os";

import {
    VIDEO_COMPRESS_PATH,
    createVideoService,
    type VideoCompressDeps,
    type VideoCompressResult,
} from "./video";

const PB_BASE = "http://127.0.0.1:8090";

function json(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), {
        status,
        headers: { "content-type": "application/json" },
    });
}

function setup(
    compress: (
        inputPath: string,
        outputPath: string,
    ) => Promise<VideoCompressResult>,
    overrides: Partial<VideoCompressDeps> = {},
) {
    const calls: string[] = [];
    const fetchMock = (async (input: RequestInfo | URL) => {
        const url = new URL(String(input));
        calls.push(url.pathname);
        if (url.pathname === "/api/collections/users/auth-refresh") {
            return json({ record: { id: "user1234567890" } });
        }
        return json({}, 404);
    }) as typeof fetch;

    const service = createVideoService({
        pbBaseUrl: PB_BASE,
        fetch: fetchMock,
        tmpDir: tmpdir(),
        compress,
        ...overrides,
    });
    return { service, calls };
}

function compressRequest(
    data: string,
    options: {
        name?: string;
        type?: string;
        token?: string | null;
    } = {},
) {
    const form = new FormData();
    form.append(
        "file",
        new File([data], options.name ?? "clip.mp4", {
            type: options.type ?? "video/mp4",
        }),
    );
    const headers: Record<string, string> = {};
    if (options.token !== null) {
        headers.Authorization = options.token ?? "pb-token";
    }
    return new Request(`http://supervisor${VIDEO_COMPRESS_PATH}`, {
        method: "POST",
        headers,
        body: form,
    });
}

describe("video compression service", () => {
    test("returns null for unrelated paths", async () => {
        const { service } = setup(async () => ({ ok: true }));
        expect(
            await service(
                new Request("http://supervisor/api/feedback/report", {
                    method: "POST",
                }),
            ),
        ).toBeNull();
    });

    test("requires a PocketBase token", async () => {
        const { service, calls } = setup(async () => ({ ok: true }));
        const res = await service(compressRequest("x", { token: null }));
        expect(res?.status).toBe(401);
        expect(calls).toHaveLength(0);
    });

    test("returns a smaller MP4 and deletes the temp files", async () => {
        let inputBytes = 0;
        const { service } = setup(async (inputPath, outputPath) => {
            inputBytes = (await Bun.file(inputPath).arrayBuffer()).byteLength;
            await Bun.write(outputPath, new Uint8Array([1, 2, 3, 4]));
            return { ok: true };
        });

        const res = await service(compressRequest("original video bytes"));
        expect(res?.status).toBe(200);
        expect(res?.headers.get("content-type")).toBe("video/mp4");
        expect(res?.headers.get("x-video-compressed")).toBe("1");
        expect(inputBytes).toBeGreaterThan(4);
        expect(new Uint8Array(await res!.arrayBuffer())).toEqual(
            new Uint8Array([1, 2, 3, 4]),
        );
    });

    test("answers 204 when the output is not smaller", async () => {
        const { service } = setup(async (inputPath, outputPath) => {
            await Bun.write(
                outputPath,
                await Bun.file(inputPath).arrayBuffer(),
            );
            return { ok: true };
        });
        const res = await service(compressRequest("same size"));
        expect(res?.status).toBe(204);
        expect(res?.headers.get("x-video-compressed")).toBe("0");
    });

    test("falls back to 503 once ffmpeg is missing", async () => {
        let attempts = 0;
        const { service } = setup(async () => {
            attempts += 1;
            return { ok: false, missing: true, error: "ffmpeg not found" };
        });

        const first = await service(compressRequest("one"));
        expect(first?.status).toBe(503);
        expect(await first!.json()).toEqual({
            ok: false,
            reason: "ffmpeg_missing",
            error: "服务器还没有安装 ffmpeg",
        });

        const second = await service(compressRequest("two"));
        expect(second?.status).toBe(503);
        expect(attempts).toBe(1);
    });

    test("reports a failed compression without failing the app", async () => {
        const { service } = setup(async () => ({
            ok: false,
            missing: false,
            error: "bad input",
        }));
        const res = await service(compressRequest("broken"));
        expect(res?.status).toBe(502);
        expect(await res!.json()).toEqual({
            ok: false,
            reason: "compress_failed",
            error: "视频压缩失败",
        });
    });

    test("rejects non-video files and oversized bodies", async () => {
        const { service } = setup(async () => ({ ok: true }));
        const text = await service(
            compressRequest("hello", { name: "notes.txt", type: "text/plain" }),
        );
        expect(text?.status).toBe(400);

        const oversized = await service(
            new Request(`http://supervisor${VIDEO_COMPRESS_PATH}`, {
                method: "POST",
                headers: {
                    Authorization: "pb-token",
                    "content-length": String(60 * 1024 * 1024),
                },
            }),
        );
        expect(oversized?.status).toBe(413);
    });
});
