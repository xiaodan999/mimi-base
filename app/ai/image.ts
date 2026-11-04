import compressImage from "@/lib/compressImage";

/**
 * 视觉模型不需要原图：长边 1024、JPEG 足够读小票和照片内容，
 * 还能把请求体压到几十 KB，避免移动网络下上传卡住。
 */
const DEFAULT_MAX_SIZE = 1024;
const DEFAULT_QUALITY = 0.7;

function blobToDataUrl(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () =>
            reject(reader.error ?? new Error("读取图片失败"));
        reader.readAsDataURL(blob);
    });
}

/**
 * 把用户选中的图片转成 `data:image/jpeg;base64,...`。
 * 压缩失败时退回原图，至少还能让模型试试。
 */
export async function imageToDataUrl(
    source: Blob,
    options: { maxSize?: number; quality?: number } = {},
): Promise<string> {
    const maxSize = options.maxSize ?? DEFAULT_MAX_SIZE;
    const quality = options.quality ?? DEFAULT_QUALITY;

    try {
        const file =
            source instanceof File
                ? source
                : new File([source], "vision.jpg", {
                      type: source.type || "image/jpeg",
                  });
        const compressed = await compressImage(file, {
            maxWidth: maxSize,
            maxHeight: maxSize,
            quality,
            mimeType: "image/jpeg",
        });
        return await blobToDataUrl(compressed);
    } catch {
        return blobToDataUrl(source);
    }
}

/** 一次转多张，顺序保持不变；单张失败只跳过它。 */
export async function imagesToDataUrls(
    sources: Blob[],
    options: { maxSize?: number; quality?: number; limit?: number } = {},
): Promise<string[]> {
    const limit = options.limit ?? sources.length;
    const settled = await Promise.allSettled(
        sources
            .slice(0, limit)
            .map((source) => imageToDataUrl(source, options)),
    );
    return settled.flatMap((result) =>
        result.status === "fulfilled" ? [result.value] : [],
    );
}
