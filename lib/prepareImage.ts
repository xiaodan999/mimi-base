import compressImage from "./compressImage";

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
    const ext = type.split("/")[1] || "jpg";
    return new File([compressed], `${Date.now()}-${index}.${ext}`, { type });
}
