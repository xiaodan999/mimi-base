import { apiUrl } from "@/lib/env";
import pb from "@/lib/pb";
import { compressedVideoFileName, VIDEO_MAX_BYTES } from "@/lib/postMedia";

/**
 * Only ask the supervisor to re-encode when the file is big enough for the
 * round-trip and CPU cost to pay off. Small clips are already cheap to load.
 */
export const VIDEO_COMPRESS_MIN_BYTES = 8 * 1024 * 1024;

export type VideoCompressionResult = {
    /** The file to upload: the compressed MP4, or the original on fallback. */
    file: File;
    compressed: boolean;
    /**
     * Machine-readable fallback reason (`small`, `ffmpeg_missing`,
     * `not_smaller`, `network`, ...). `null` when compression succeeded.
     */
    reason: string | null;
};

/**
 * Compress a picked video through the Bun supervisor (`POST
 * /api/video/compress`). The original is uploaded to the supervisor once and
 * only the returned MP4 is sent to PocketBase, so the stored copy is small
 * from the first load.
 *
 * Every failure is non-fatal: the caller gets the original file back and can
 * publish normally. ffmpeg is optional on the server, so this path must never
 * block a post.
 */
export async function compressVideoForUpload(
    file: File,
): Promise<VideoCompressionResult> {
    if (file.size < VIDEO_COMPRESS_MIN_BYTES) {
        return { file, compressed: false, reason: "small" };
    }
    if (file.size > VIDEO_MAX_BYTES) {
        // The composer already rejects this; keep the helper total anyway.
        return { file, compressed: false, reason: "too_large" };
    }

    const token = pb.authStore.token;
    if (!token) {
        return { file, compressed: false, reason: "unauthorized" };
    }

    const form = new FormData();
    form.append("file", file, file.name);

    let res: Response;
    try {
        res = await fetch(apiUrl("/video/compress"), {
            method: "POST",
            headers: { Authorization: token },
            body: form,
        });
    } catch {
        return { file, compressed: false, reason: "network" };
    }

    // 204 means the server re-encoded the clip but it did not get smaller.
    if (res.status === 204) {
        return { file, compressed: false, reason: "not_smaller" };
    }
    if (!res.ok) {
        let reason = `http_${res.status}`;
        try {
            const body = (await res.json()) as { reason?: unknown };
            if (typeof body.reason === "string" && body.reason) {
                reason = body.reason;
            }
        } catch {
            // proxy error page; keep the status-based reason
        }
        return { file, compressed: false, reason };
    }

    let blob: Blob;
    try {
        blob = await res.blob();
    } catch {
        return { file, compressed: false, reason: "network" };
    }
    if (!blob.size || blob.size >= file.size) {
        return { file, compressed: false, reason: "not_smaller" };
    }

    const type = res.headers.get("content-type")?.split(";")[0] || "video/mp4";
    if (!type.startsWith("video/")) {
        return { file, compressed: false, reason: "not_video" };
    }
    return {
        file: new File([blob], compressedVideoFileName(file.name), {
            type,
        }),
        compressed: true,
        reason: null,
    };
}
