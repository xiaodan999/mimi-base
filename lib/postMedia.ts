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

/** Keep the picked stem but use the MP4 extension the compressor returns. */
export function compressedVideoFileName(name: string): string {
    const stem = name.replace(/\.[^./\\]+$/, "").trim() || "video";
    return `${stem}.mp4`;
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

/** Used until the video reports its intrinsic size, so the box never collapses. */
export const DEFAULT_VIDEO_RATIO = 16 / 9;

/**
 * Portrait clips keep their own shape down to 2:5. x.com renders a 590×1280
 * phone recording (0.46) at its native ratio; the old 9:16 cap letterboxed
 * those with black side bars. The 75dvh height cap still stops one clip from
 * eating the whole feed.
 */
export const MIN_VIDEO_RATIO = 2 / 5;

/** Wider than 16:9 gets letterboxed inside a 16:9 box instead of letter-shaped. */
export const MAX_VIDEO_RATIO = 16 / 9;

/**
 * Display aspect ratio (width / height) for a feed video. The box follows the
 * clip's intrinsic ratio — a portrait 9:16 clip fills the card instead of
 * sitting in a 16:9 box as a narrow pillar — clamped to 2:5..16:9 so one
 * extreme recording cannot dominate the feed. Falls back to 16:9 before
 * metadata is known or when the browser reports no size.
 */
export function videoDisplayRatio(width: number, height: number): number {
    if (
        !Number.isFinite(width) ||
        !Number.isFinite(height) ||
        width <= 0 ||
        height <= 0
    ) {
        return DEFAULT_VIDEO_RATIO;
    }
    return Math.min(MAX_VIDEO_RATIO, Math.max(MIN_VIDEO_RATIO, width / height));
}

/**
 * `m:ss` (or `h:mm:ss`) for the idle-state duration badge. Returns "" for
 * unknown/streamed durations, which would otherwise render `NaN:NaN`.
 */
export function formatVideoDuration(seconds: number): string {
    if (!Number.isFinite(seconds) || seconds <= 0) return "";
    const total = Math.round(seconds);
    const hours = Math.floor(total / 3600);
    const minutes = Math.floor((total % 3600) / 60);
    const rest = total % 60;
    const paddedRest = String(rest).padStart(2, "0");
    if (hours > 0) {
        return `${hours}:${String(minutes).padStart(2, "0")}:${paddedRest}`;
    }
    return `${minutes}:${paddedRest}`;
}

// ---------------------------------------------------------------------------
// Stored media sizes (posts.media_meta)
// ---------------------------------------------------------------------------

export type MediaSize = { width: number; height: number };

/** Validate one size from the posts.media_meta JSON field. */
export function toMediaSize(value: unknown): MediaSize | null {
    if (!value || typeof value !== "object") return null;
    const { width, height } = value as { width?: unknown; height?: unknown };
    if (
        typeof width !== "number" ||
        typeof height !== "number" ||
        !Number.isFinite(width) ||
        !Number.isFinite(height) ||
        width <= 0 ||
        height <= 0
    ) {
        return null;
    }
    return { width, height };
}

export type PostMediaMeta = {
    /** Positional sizes for `posts.images`; null keeps an unknown slot. */
    images: (MediaSize | null)[];
    video: MediaSize | null;
};

/**
 * Read the positional media sizes stored with a post. Old posts have no field
 * and a hand-edited row can be anything, so every entry is validated instead
 * of trusted; a missing entry only means "fall back to measuring on load".
 */
export function parsePostMediaMeta(value: unknown): PostMediaMeta {
    if (!value || typeof value !== "object") {
        return { images: [], video: null };
    }
    const meta = value as { images?: unknown; video?: unknown };
    return {
        images: Array.isArray(meta.images)
            ? meta.images.map((entry) => toMediaSize(entry))
            : [],
        video: toMediaSize(meta.video),
    };
}

/**
 * Read a video file's intrinsic size by letting the browser parse its
 * metadata, so publishing can store the box the feed should reserve. Returns
 * null when the browser cannot decode it (the feed then measures as before).
 */
export function readVideoSize(file: File): Promise<MediaSize | null> {
    if (
        typeof document === "undefined" ||
        typeof URL.createObjectURL !== "function"
    ) {
        return Promise.resolve(null);
    }
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    let timer: number | undefined;
    return new Promise((resolve) => {
        const finish = (size: MediaSize | null) => {
            if (timer !== undefined) window.clearTimeout(timer);
            video.removeAttribute("src");
            video.load();
            URL.revokeObjectURL(url);
            resolve(size);
        };
        video.preload = "metadata";
        video.muted = true;
        video.onloadedmetadata = () =>
            finish(
                toMediaSize({
                    width: video.videoWidth,
                    height: video.videoHeight,
                }),
            );
        video.onerror = () => finish(null);
        timer = window.setTimeout(() => finish(null), 8000);
        video.src = url;
    });
}
