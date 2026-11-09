const MINUTE = 60 * 1000;

export type ComposerImageRef =
    | { kind: "file"; file: File; thumb?: File | null }
    | { kind: "existing"; name: string; thumb?: string };

export type PostImagesFields = {
    /** Existing filenames to keep, in the order they appear in the composer. */
    keep: string[];
    /** Newly picked files to upload. */
    files: File[];
    /** Existing thumbnail filenames to keep. */
    keepThumbs: string[];
    /** Newly generated thumbnails to upload. */
    thumbs: File[];
};

export type ComposerVideoRef =
    { kind: "file"; file: File } | { kind: "existing"; name: string };

export type PostVideoFields = {
    /** Existing filename to keep when editing, or [] to clear the field. */
    keep: string[];
    /** Newly picked file to upload. */
    files: File[];
};

/**
 * Mirrors `buildPostImagesFields` for the single `videos` field. A post has
 * at most one video; omitting the field on update keeps the current file, so
 * callers must send `videos: ""` when both lists are empty to remove it.
 */
export function buildPostVideoFields(
    video: ComposerVideoRef | null,
): PostVideoFields {
    if (!video) return { keep: [], files: [] };
    if (video.kind === "existing") {
        return { keep: [video.name], files: [] };
    }
    return { keep: [], files: [video.file] };
}

/**
 * Splits the composer's previews into what PocketBase expects on update:
 * already-uploaded filenames to keep and new files to upload. An empty result
 * means the caller must clear the field explicitly, otherwise PocketBase
 * leaves the existing files untouched.
 *
 * Thumbnails are collected in the same pass but stay in their own lists: a
 * photo whose thumbnail failed to encode is still uploaded, and the file name
 * token (not the position) is what links a thumb back to its image.
 */
export function buildPostImagesFields(
    images: ComposerImageRef[],
): PostImagesFields {
    const keep: string[] = [];
    const files: File[] = [];
    const keepThumbs: string[] = [];
    const thumbs: File[] = [];

    for (const image of images) {
        if (image.kind === "existing") {
            keep.push(image.name);
            if (image.thumb) keepThumbs.push(image.thumb);
        } else {
            files.push(image.file);
            if (image.thumb) thumbs.push(image.thumb);
        }
    }

    return { keep, files, keepThumbs, thumbs };
}

function startOfDay(date: Date) {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function pad(value: number) {
    return value.toString().padStart(2, "0");
}

function daysAgo(date: Date, now: Date) {
    return Math.round(
        (startOfDay(now).getTime() - startOfDay(date).getTime()) / 86400000,
    );
}

function shortDate(date: Date) {
    return `${date.getMonth() + 1}月${date.getDate()}日`;
}

function timeOfDay(date: Date) {
    return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/**
 * Moments-style relative time: 刚刚 / 5分钟前 / 3小时前 / 昨天 21:04 / ...
 */
export function formatRelativeTime(value: string | Date, now = new Date()) {
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return "";

    const diff = now.getTime() - date.getTime();
    if (diff < MINUTE) return "刚刚";
    if (diff < 60 * MINUTE) return `${Math.floor(diff / MINUTE)}分钟前`;

    const days = daysAgo(date, now);
    if (days === 0) return `${Math.max(1, Math.floor(diff / 3600000))}小时前`;
    if (days === 1) return `昨天 ${timeOfDay(date)}`;
    if (days > 1 && days < 7) return `${days}天前`;
    if (date.getFullYear() === now.getFullYear()) {
        return `${shortDate(date)} ${timeOfDay(date)}`;
    }
    return `${date.getFullYear()}年${shortDate(date)}`;
}

export function isSameDay(a: string | Date, b: string | Date) {
    const dateA = a instanceof Date ? a : new Date(a);
    const dateB = b instanceof Date ? b : new Date(b);
    return (
        dateA.getFullYear() === dateB.getFullYear() &&
        dateA.getMonth() === dateB.getMonth() &&
        dateA.getDate() === dateB.getDate()
    );
}

/**
 * Label for the divider shown before the first post of a day.
 */
export function formatDayDivider(value: string | Date, now = new Date()) {
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return "";

    const days = daysAgo(date, now);
    if (days === 0) return "今天";
    if (days === 1) return "昨天";
    if (date.getFullYear() === now.getFullYear()) return shortDate(date);
    return `${date.getFullYear()}年${shortDate(date)}`;
}

/** Feed filter month key, e.g. "2024-03" (local time). */
export function monthKeyOf(value: string | Date) {
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}`;
}

/** `2024-03` -> `2024年3月`; malformed keys come back unchanged. */
export function formatMonthLabel(key: string) {
    const [year, month] = key.split("-").map(Number);
    if (!year || !month) return key;
    return `${year}年${month}月`;
}

export type PostMonth = {
    /** "YYYY-MM", used in the URL and the feed filter. */
    key: string;
    label: string;
    count: number;
};

/**
 * Groups post timestamps into the months that have posts, newest first.
 *
 * The archive only needs timestamps, so the caller can fetch `fields=created`
 * and stay small even with thousands of posts.
 */
export function groupPostMonths(values: Array<string | Date>): PostMonth[] {
    const counts = new Map<string, number>();
    for (const value of values) {
        const key = monthKeyOf(value);
        if (!key) continue;
        counts.set(key, (counts.get(key) ?? 0) + 1);
    }

    return [...counts.entries()]
        .sort(([a], [b]) => (a === b ? 0 : a < b ? 1 : -1))
        .map(([key, count]) => ({ key, label: formatMonthLabel(key), count }));
}
