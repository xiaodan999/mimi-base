import type {
    MediaSize,
    PostMediaMeta,
    PostMediaOrderEntry,
} from "@/lib/postMedia";

const MINUTE = 60 * 1000;

/**
 * One composer media item, photo or video, either already uploaded (editing)
 * or still a local file. The composer keeps a single ordered list of these so
 * photos and videos can be reordered across types.
 */
export type ComposerMediaRef =
    | {
          type: "image";
          kind: "file";
          file: File;
          thumb?: File | null;
          width?: number;
          height?: number;
      }
    | {
          type: "image";
          kind: "existing";
          name: string;
          thumb?: string;
          width?: number;
          height?: number;
      }
    | {
          type: "video";
          kind: "file";
          file: File;
          width?: number;
          height?: number;
      }
    | {
          type: "video";
          kind: "existing";
          name: string;
          width?: number;
          height?: number;
      };

function sizeOf(media: { width?: number; height?: number }): MediaSize | null {
    return media.width && media.height
        ? { width: media.width, height: media.height }
        : null;
}

/** One item addressed inside the split keep/file lists. */
type DraftMediaSlot = {
    type: "image" | "video";
    source: "keep" | "file";
    /** Index inside the keep list or the upload list. */
    index: number;
    size: MediaSize | null;
};

export type PostMediaFields = {
    /** Existing photo filenames to keep, in upload (keep) order. */
    keepImages: string[];
    /** Newly picked photo files to upload. */
    files: File[];
    /** Existing thumbnail filenames to keep. */
    keepThumbs: string[];
    /** Newly generated thumbnails to upload. */
    thumbs: File[];
    /** Existing video filenames to keep, in upload (keep) order. */
    keepVideos: string[];
    /** Newly picked video files to upload. */
    videoFiles: File[];
    /**
     * Sizes aligned with the FINAL stored arrays (kept files first, then new
     * uploads) instead of the composer's visual order, because that is what
     * `media_meta` is positional against.
     */
    mediaMeta: PostMediaMeta;
    /** The visual order as indices into the final stored arrays. */
    order: PostMediaOrderEntry[];
};

/**
 * Splits the composer's media into what PocketBase expects on create/update:
 * already-uploaded filenames to keep and new files to upload, plus the mixed
 * `media_order` and the positional sizes.
 *
 * PocketBase writes kept filenames first (in submission order) and appends new
 * uploads in the order they were added to the form, so the final index of
 * every item is known before the request is sent — the order therefore rides
 * along in the same request and no second filename-only update is needed.
 * `images[0]` stays the first kept/uploaded photo (not necessarily the first
 * item on screen), which is fine: it is only used as a thumbnail elsewhere.
 */
export function buildPostMediaFields(
    media: ComposerMediaRef[],
): PostMediaFields {
    const keepImages: string[] = [];
    const files: File[] = [];
    const keepThumbs: string[] = [];
    const thumbs: File[] = [];
    const keepVideos: string[] = [];
    const videoFiles: File[] = [];
    const slots: DraftMediaSlot[] = [];

    for (const item of media) {
        const size = sizeOf(item);
        if (item.type === "image") {
            if (item.kind === "existing") {
                slots.push({
                    type: "image",
                    source: "keep",
                    index: keepImages.length,
                    size,
                });
                keepImages.push(item.name);
                if (item.thumb) keepThumbs.push(item.thumb);
            } else {
                slots.push({
                    type: "image",
                    source: "file",
                    index: files.length,
                    size,
                });
                files.push(item.file);
                if (item.thumb) thumbs.push(item.thumb);
            }
        } else if (item.kind === "existing") {
            slots.push({
                type: "video",
                source: "keep",
                index: keepVideos.length,
                size,
            });
            keepVideos.push(item.name);
        } else {
            slots.push({
                type: "video",
                source: "file",
                index: videoFiles.length,
                size,
            });
            videoFiles.push(item.file);
        }
    }

    const imageMeta: (MediaSize | null)[] = Array.from(
        { length: keepImages.length + files.length },
        () => null,
    );
    const videoMeta: (MediaSize | null)[] = Array.from(
        { length: keepVideos.length + videoFiles.length },
        () => null,
    );
    const order: PostMediaOrderEntry[] = [];

    for (const slot of slots) {
        const index =
            slot.source === "keep"
                ? slot.index
                : (slot.type === "image"
                      ? keepImages.length
                      : keepVideos.length) + slot.index;
        order.push({ type: slot.type, index });
        if (slot.type === "image") imageMeta[index] = slot.size;
        else videoMeta[index] = slot.size;
    }

    return {
        keepImages,
        files,
        keepThumbs,
        thumbs,
        keepVideos,
        videoFiles,
        mediaMeta: { images: imageMeta, videos: videoMeta },
        order,
    };
}

/**
 * A photo slot's viewport box while a drag gesture is in progress.
 */
export type SortSlotRect = {
    index: number;
    left: number;
    top: number;
    right: number;
    bottom: number;
};

/**
 * Which photo slot a pointer is over. The slots are captured when the drag
 * starts, so reordering the photos underneath the finger cannot move the
 * target out from under it.
 */
export function sortTargetAt(
    slots: readonly SortSlotRect[],
    x: number,
    y: number,
): number | null {
    for (const slot of slots) {
        if (
            x >= slot.left &&
            x <= slot.right &&
            y >= slot.top &&
            y <= slot.bottom
        ) {
            return slot.index;
        }
    }
    return null;
}

/**
 * Move one item to a new index without mutating the input. Invalid moves and
 * no-ops return the original array so React skips a pointless re-render.
 */
export function moveArrayItem<T>(items: T[], from: number, to: number): T[] {
    if (
        from === to ||
        from < 0 ||
        to < 0 ||
        from >= items.length ||
        to >= items.length
    ) {
        return items;
    }
    const next = items.slice();
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    return next;
}

/**
 * Pairs every media item with its index among items of the same kind, so a
 * mixed list can open the image viewer or the video viewer at the right item.
 */
export function indexMediaByKind<T extends { type: "image" | "video" }>(
    media: readonly T[],
): { item: T; index: number }[] {
    let imageIndex = 0;
    let videoIndex = 0;
    return media.map((item) => {
        const index = item.type === "image" ? imageIndex++ : videoIndex++;
        return { item, index };
    });
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
