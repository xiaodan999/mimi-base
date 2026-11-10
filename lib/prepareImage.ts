import compressImage, { canEncodeWebp } from "./compressImage";
import { photoFileName, photoToken } from "./photoFiles";

/** Square edge of the grid thumbnail, matching the old `600x600` server thumb. */
const THUMB_SIZE = 600;
const THUMB_QUALITY = 0.8;

function extensionOf(type: string) {
    return type.split("/")[1] || "jpg";
}

/**
 * Shrink a picked photo and wrap it in a File with a web-friendly extension.
 * Shared by the post composer and the comment box so both upload the same
 * kind of compressed image.
 */
export default async function prepareImage(
    file: File,
    index = 0,
): Promise<File> {
    const compressed = await compressImage(file);
    const type = compressed.type || "image/jpeg";
    const ext = extensionOf(type);
    return new File([compressed], `${Date.now()}-${index}.${ext}`, { type });
}

type ThumbnailResult = {
    /** The encoded square thumb, or null when it could not be produced. */
    thumb: File | null;
    /** Intrinsic size of the source photo, for the feed's reserved box. */
    width: number;
    height: number;
};

/**
 * A square 600px crop encoded in the browser.
 *
 * PocketBase can only write JPEG/PNG thumbnails, and its PNG thumbnail of a
 * WebP source comes out several times larger than the source itself. Encoding
 * one here keeps the image in WebP and costs ~45KB instead of ~500KB.
 *
 * The bitmap is decoded from the picked file, not from the compressed upload,
 * so the thumbnail is not a re-encode of an already lossy image. The same
 * decode reports the source size for `posts.media_meta`.
 */
async function makeThumbnail(file: File): Promise<ThumbnailResult | null> {
    try {
        const bitmap = await createImageBitmap(file);
        const width = bitmap.width;
        const height = bitmap.height;
        const canvas = document.createElement("canvas");
        canvas.width = THUMB_SIZE;
        canvas.height = THUMB_SIZE;

        const context = canvas.getContext("2d");
        if (!context) {
            bitmap.close();
            return { thumb: null, width, height };
        }

        // Same framing as the grid's `object-cover`: fill the square and crop
        // the overflow from the centre.
        const scale = Math.max(
            THUMB_SIZE / bitmap.width,
            THUMB_SIZE / bitmap.height,
        );
        const drawnWidth = bitmap.width * scale;
        const drawnHeight = bitmap.height * scale;
        context.drawImage(
            bitmap,
            (THUMB_SIZE - drawnWidth) / 2,
            (THUMB_SIZE - drawnHeight) / 2,
            drawnWidth,
            drawnHeight,
        );
        bitmap.close();

        const type = canEncodeWebp() ? "image/webp" : "image/jpeg";
        const blob = await new Promise<Blob | null>((resolve) =>
            canvas.toBlob(resolve, type, THUMB_QUALITY),
        );
        if (!blob) return { thumb: null, width, height };

        const blobType = blob.type || type;
        return {
            thumb: new File([blob], `thumb.${extensionOf(blobType)}`, {
                type: blobType,
            }),
            width,
            height,
        };
    } catch {
        // A missing thumbnail is survivable: the grid falls back to the full
        // image. Never block the upload over it.
        return null;
    }
}

export type PreparedPhoto = {
    /** The full-size upload (≤1600px, WebP when the browser can encode it). */
    main: File;
    /** 600px square WebP, or null when the browser could not produce one. */
    thumb: File | null;
    /** Source size; 0/0 when the browser could not decode it. */
    width: number;
    height: number;
};

/**
 * Prepares one post photo as a pair of files that share a token in their
 * names, so the thumbnail can be matched to its image after PocketBase
 * renames them.
 */
export async function preparePhoto(file: File): Promise<PreparedPhoto> {
    const token = photoToken();
    const [compressed, metadata] = await Promise.all([
        compressImage(file),
        makeThumbnail(file),
    ]);

    const mainType = compressed.type || "image/jpeg";
    const main = new File(
        [compressed],
        photoFileName(token, "main", extensionOf(mainType)),
        { type: mainType },
    );

    const thumbnail = metadata?.thumb ?? null;
    const thumb = thumbnail
        ? new File(
              [thumbnail],
              photoFileName(token, "thumbnail", extensionOf(thumbnail.type)),
              { type: thumbnail.type },
          )
        : null;

    return {
        main,
        thumb,
        width: metadata?.width ?? 0,
        height: metadata?.height ?? 0,
    };
}
