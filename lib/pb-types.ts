/**
 * Single source of truth for PocketBase record shapes and the mappers that
 * turn them into the app's view models.
 *
 * Every record type is derived from the SDK's `RecordModel` so the shared
 * `id` / `collectionId` / `collectionName` fields stay in one place; a schema
 * change only needs a single edit here. The mappers are intentionally named
 * exports so feature files (and the upgrade's integration pass) can share
 * them instead of re-declaring shapes or relying on `as unknown as` casts.
 */
import type { RecordModel } from "pocketbase";

import { pairThumbs } from "@/lib/photoFiles";
import { fileNames, type MediaSize, parsePostMediaMeta } from "@/lib/postMedia";

/** The system fields every PocketBase row carries. */
type PbRecord = Pick<RecordModel, "id" | "collectionId" | "collectionName">;

// ---------------------------------------------------------------------------
// App-facing view models
// ---------------------------------------------------------------------------

/**
 * Feed presentation for a post. The old `moments` (朋友圈九宫格) layout was
 * retired: rows that still carry it are mapped to `twitter` by `toPostData`.
 * A row with no photos and no video is mapped to `twitter` too: the full-bleed
 * card has nothing to show and would draw the action row above the text.
 */
export type PostLayout = "instagram" | "twitter";

export type PostImage = {
    name: string;
    /** 600px grid thumbnail; absent on posts uploaded before thumbnails. */
    thumb?: string;
    /** Intrinsic size recorded at upload time; absent on old posts. */
    width?: number;
    height?: number;
};

export type Circle = {
    id: string;
    name: string;
    description: string;
    // file filename ("" when unset)
    image: string;
    // relation id of the uploader ("" for admin-seeded rings)
    owner?: string;
    // Kept so `getFileUrl` can build a protected URL from an expanded circle.
    collectionId?: string;
    collectionName?: string;
};

export type User = {
    id: string;
    // Auth collections carry it; an expanded relation always does. Kept on the
    // view model so screens can tell which account is signed in without going
    // back to `pb.authStore.record`.
    email?: string;
    user_name: string;
    // file filename ("" when unset); the URL comes from pb.files.getURL
    tou_xiang: string;
    // relation id ("" when unset); the record comes from `expand.circle`
    circle: string;
    // built-in ring key; "" is the default ring, "none" hides it
    circle_preset?: string;
    expand?: {
        circle?: Circle;
    };
    // Kept so `getUserAvatarUrl` can build a protected URL from a mapped user.
    collectionId?: string;
    collectionName?: string;
};

export type PostData = {
    id: string;
    text: string;
    author: User;
    createdAt: string;
    liked: boolean;
    layout: PostLayout;
    // Needed to build protected file URLs at render time.
    collectionId: string;
    images: PostImage[];
    /** Video filenames (at most one); empty for photo/text posts. */
    videos: string[];
    /** Intrinsic size of the stored video, when the uploader recorded it. */
    videoSize?: MediaSize;
    metrics: {
        likeCount: number;
        replyCount: number;
    };
};

export type CommentData = {
    id: string;
    text: string;
    author: User;
    createdAt: string;
    // PocketBase's autodate; later than `createdAt` once the comment is edited.
    updatedAt: string;
    // "" for a top-level comment.
    parentId: string;
    /** Uploaded filenames; text or at least one image is present. */
    images: string[];
    /** Needed to build protected file URLs for the images. */
    collectionId: string;
};

export type CommentThread = {
    root: CommentData;
    // Every descendant, flattened in chronological order. The `回复 @name`
    // prefix in the UI keeps the actual parent visible without deep indents.
    replies: CommentData[];
};

export type JiZhangItemData = {
    id: string;
    price: number;
    itemName: string;
    createdAt: string;
    /** Empty for rows created before the category field was added. */
    category: string;
};

export type MyRing = {
    id: string;
    name: string;
    image: string;
    collectionId: string;
    collectionName: string;
    owner?: string;
};

/** Fallback author used when an expand is missing (e.g. a deleted user). */
export const EMPTY_AUTHOR: User = {
    id: "",
    user_name: "",
    tou_xiang: "",
    circle: "",
};

// ---------------------------------------------------------------------------
// PocketBase record shapes
// ---------------------------------------------------------------------------

export type PostRecord = PbRecord & {
    text: string;
    created: string;
    like_count: number;
    comment_count: number;
    images?: string[];
    /**
     * 600px thumbnails, paired to `images` by the token in their file name
     * (see lib/photoFiles.ts). Uploaded by the client because PocketBase would
     * re-encode them as PNG.
     */
    thumbs?: string[];
    /**
     * One MP4 / WebM / MOV filename; mutually exclusive with `images`.
     * A single-file field comes back as a string from PocketBase.
     */
    videos?: string | string[];
    /** Positional intrinsic sizes, so the feed can reserve media boxes. */
    media_meta?: unknown;
    layout?: string;
    expand?: {
        author_id?: User;
    };
};

export type CommentRecord = PbRecord & {
    text: string;
    created: string;
    updated: string;
    parent_id?: string;
    images?: string[];
    expand?: {
        author_id?: User;
    };
};

export type JiZhangRecord = PbRecord & {
    item_name: string;
    price: number;
    created: string;
    category?: string;
};

export type PostLikeRecord = PbRecord & {
    post_id: string;
    user_id: string;
};

export type UserRecord = PbRecord & {
    email?: string;
    user_name?: string;
    tou_xiang?: string;
    circle?: string;
    circle_preset?: string;
    expand?: {
        circle?: CircleRecord;
    };
};

export type CircleRecord = PbRecord & {
    name?: string;
    description?: string;
    image?: string;
    owner?: string;
};

export type TouXiangCircleRecord = PbRecord & {
    name?: string;
    image?: string;
    owner?: string;
};

export type JiZhangCategoryRecord = PbRecord & {
    name: string;
    icon?: string;
};

// ---------------------------------------------------------------------------
// Mappers
// ---------------------------------------------------------------------------

export function toCircle(record: CircleRecord): Circle {
    const circle: Circle = {
        id: record.id,
        name: record.name ?? "",
        description: record.description ?? "",
        image: record.image ?? "",
        collectionId: record.collectionId,
        collectionName: record.collectionName,
    };
    if (record.owner !== undefined) circle.owner = record.owner;
    return circle;
}

export function toUser(record: UserRecord): User {
    const user: User = {
        id: record.id,
        user_name: record.user_name ?? "",
        tou_xiang: record.tou_xiang ?? "",
        circle: record.circle ?? "",
        collectionId: record.collectionId,
        collectionName: record.collectionName,
    };
    if (record.email) user.email = record.email;
    if (record.circle_preset !== undefined) {
        user.circle_preset = record.circle_preset;
    }
    const circle = record.expand?.circle;
    if (circle) user.expand = { circle: toCircle(circle) };
    return user;
}

export function toPostData(
    post: PostRecord,
    likedPostIds: Set<string>,
): PostData {
    const media = parsePostMediaMeta(post.media_meta);
    const images = pairThumbs(post.images ?? [], post.thumbs ?? []).map(
        (image, index) => {
            const size = media.images[index];
            return size
                ? {
                      ...image,
                      width: size.width,
                      height: size.height,
                  }
                : image;
        },
    );
    const videos = fileNames(post.videos);
    // The composer hides the layout picker when the draft has no media, so
    // removing the last photo from a 大图 post saves it as `instagram` with an
    // empty media set. Such a row has nothing for the full-bleed card to show,
    // and that branch repeats the author name before the caption, so treat it
    // as the timeline card. Rows that still have a photo or a video keep
    // whatever layout they were saved with.
    const layout: PostLayout =
        post.layout === "instagram" && (images.length > 0 || videos.length > 0)
            ? "instagram"
            : "twitter";
    const data: PostData = {
        id: post.id,
        text: post.text,
        author: post.expand?.author_id ?? EMPTY_AUTHOR,
        createdAt: post.created,
        liked: likedPostIds.has(post.id),
        layout,
        collectionId: post.collectionId,
        images,
        videos,
        metrics: {
            likeCount: post.like_count ?? 0,
            replyCount: post.comment_count ?? 0,
        },
    };
    if (media.video) data.videoSize = media.video;
    return data;
}

export function toCommentData(record: CommentRecord): CommentData {
    return {
        id: record.id,
        text: record.text,
        author: record.expand?.author_id ?? EMPTY_AUTHOR,
        createdAt: record.created,
        updatedAt: record.updated,
        parentId: record.parent_id ?? "",
        images: record.images ?? [],
        collectionId: record.collectionId,
    };
}

export function toJiZhangItemData(record: JiZhangRecord): JiZhangItemData {
    return {
        id: record.id,
        price: record.price,
        itemName: record.item_name,
        createdAt: record.created,
        category: record.category ?? "",
    };
}

export function toMyRing(record: TouXiangCircleRecord): MyRing {
    const ring: MyRing = {
        id: record.id,
        name: record.name ?? "",
        image: record.image ?? "",
        collectionId: record.collectionId,
        collectionName: record.collectionName,
    };
    if (record.owner !== undefined) ring.owner = record.owner;
    return ring;
}
