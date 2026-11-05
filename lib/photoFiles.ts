/**
 * Thumbnails live in their own file field, and PocketBase has no way to link a
 * thumb to the image it came from. The link lives in the filename instead:
 *
 *     <token>_main.webp
 *     <token>_thumbnail.webp
 *
 * PocketBase keeps the base name and only appends a random suffix on upload
 * (`<token>_main_ab12cd34ef.webp`), so the token survives and pairing never
 * depends on the order of the two file lists.
 */

const LETTERS = "abcdefghijklmnopqrstuvwxyz";
const ALPHANUMERIC = `${LETTERS}0123456789`;

export type PhotoVariant = "main" | "thumbnail";

export type PairedImage = {
    name: string;
    /** Thumbnail filename, when one was uploaded for this image. */
    thumb?: string;
};

/**
 * Ten random characters, always starting with a letter so a token can never be
 * mistaken for a pre-thumbnail upload (`1793802266583-0.…`).
 *
 * The `random` parameter only exists so tests can pin the output.
 */
export function photoToken(random: () => number = Math.random): string {
    const pick = (alphabet: string) =>
        alphabet[Math.floor(random() * alphabet.length)] ?? alphabet[0];

    let token = pick(LETTERS);
    for (let index = 0; index < 9; index += 1) {
        token += pick(ALPHANUMERIC);
    }
    return token;
}

/** Upload name for one half of a photo. */
export function photoFileName(
    token: string,
    variant: PhotoVariant,
    extension: string,
) {
    return `${token}_${variant}.${extension}`;
}

/**
 * The pairing key of a stored filename: everything before the first `_`.
 * Returns "" for a name with no separator, which callers treat as "unpaired".
 */
export function photoKey(fileName: string) {
    const stem = fileName.replace(/\.[^.]+$/, "");
    return stem.split("_")[0] ?? "";
}

/**
 * Attaches each image's thumbnail by filename key. Images without a matching
 * thumb (every post created before thumbnails existed, or an upload where the
 * thumbnail failed) simply have no `thumb` and the UI falls back to the full
 * image. Extra thumbs with no image are ignored.
 */
export function pairThumbs(images: string[], thumbs: string[]): PairedImage[] {
    if (thumbs.length === 0) return images.map((name) => ({ name }));

    const thumbByKey = new Map<string, string>();
    for (const thumb of thumbs) {
        const key = photoKey(thumb);
        if (key && !thumbByKey.has(key)) thumbByKey.set(key, thumb);
    }

    return images.map((name) => {
        const thumb = thumbByKey.get(photoKey(name));
        return thumb ? { name, thumb } : { name };
    });
}
