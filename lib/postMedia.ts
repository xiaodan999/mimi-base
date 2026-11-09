/**
 * Video upload rules for 动态. Kept pure so the composer, the create/update
 * mutations and tests agree on the same limits.
 *
 * Only the three containers PocketBase accepts are allowed (see the
 * `1795600000_add_post_videos` migration). iPhones record `.mov`
 * (video/quicktime), Android and most cameras produce MP4, and WebM is the
 * browser-friendly fallback.
 */

export const VIDEO_MAX_BYTES = 50 * 1024 * 1024;

/** `accept` for the system file picker: MIME types plus extensions. */
export const VIDEO_ACCEPT =
    "video/mp4,video/webm,video/quicktime,.mp4,.webm,.mov";

export const SUPPORTED_VIDEO_MIME_TYPES = [
    "video/mp4",
    "video/webm",
    "video/quicktime",
] as const;

export const SUPPORTED_VIDEO_EXTENSIONS = ["mp4", "webm", "mov"] as const;

type VideoCandidate = {
    name: string;
    type?: string;
    size: number;
};

/**
 * PocketBase returns a file field with `maxSelect: 1` as a plain string
 * (multi-file fields come back as arrays). Normalize both shapes so callers
 * can always index by position — indexing a filename string yields its first
 * character, which silently produced a broken `/api/files/.../t` URL.
 */
export function fileNames(
    value: string | string[] | null | undefined,
): string[] {
    if (!value) return [];
    return Array.isArray(value) ? value.filter(Boolean) : [value];
}

/** Lowercase extension without the dot; "" when there is none. */
export function videoExtension(name: string): string {
    const match = /\.([^.\\/]+)$/.exec(name.trim());
    return match ? match[1].toLowerCase() : "";
}

function isSupportedType(type: string): boolean {
    return (SUPPORTED_VIDEO_MIME_TYPES as readonly string[]).includes(type);
}

function isSupportedExtension(name: string): boolean {
    return (SUPPORTED_VIDEO_EXTENSIONS as readonly string[]).includes(
        videoExtension(name),
    );
}

/**
 * Returns a Chinese error message when the picked file cannot be uploaded,
 * or `null` when it is fine. Browsers occasionally report an empty
 * `file.type`, so an allowed extension is accepted as a fallback; the server
 * still validates the MIME type of the actual bytes.
 */
export function videoFileError(file: VideoCandidate): string | null {
    if (!file.name.trim()) return "请选择一个视频文件";
    if (file.size <= 0) return "这个视频是空的，换一个试试";
    if (file.size > VIDEO_MAX_BYTES) {
        return `视频不能超过 50MB，这个有 ${formatFileSize(file.size)}`;
    }

    const type = (file.type ?? "").toLowerCase();
    if (type) {
        if (!isSupportedType(type)) {
            return "只支持 MP4、WebM 或 MOV 视频";
        }
        return null;
    }

    return isSupportedExtension(file.name)
        ? null
        : "只支持 MP4、WebM 或 MOV 视频";
}

/** Human-readable file size for the composer's preview card. */
export function formatFileSize(bytes: number): string {
    if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
    if (bytes < 1024) return `${Math.round(bytes)} B`;
    const kb = bytes / 1024;
    if (kb < 1024) {
        return `${kb < 10 ? kb.toFixed(1) : Math.round(kb)} KB`;
    }
    const mb = kb / 1024;
    return `${mb < 10 ? mb.toFixed(1) : Math.round(mb)} MB`;
}

/**
 * A protected file URL plus a media fragment, so `<video preload="metadata">`
 * decodes and shows a first frame instead of a blank box. The fragment must
 * stay after the query (the token lives there), and an existing fragment
 * wins.
 */
export function videoFirstFrameUrl(url: string): string {
    if (!url) return "";
    return url.includes("#") ? url : `${url}#t=0.1`;
}
