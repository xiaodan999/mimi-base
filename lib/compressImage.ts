import Compressor from "compressorjs";

let webpEncodeSupported: boolean | undefined;

/**
 * `canvas.toBlob` silently falls back to PNG when the browser can't encode
 * WebP (older iOS Safari), which can make a "compressed" photo bigger than
 * the original. Detect support once and fall back to JPEG instead.
 */
export function canEncodeWebp() {
    if (webpEncodeSupported !== undefined) return webpEncodeSupported;

    try {
        const canvas = document.createElement("canvas");
        canvas.width = 1;
        canvas.height = 1;
        webpEncodeSupported = canvas
            .toDataURL("image/webp")
            .startsWith("data:image/webp");
    } catch {
        webpEncodeSupported = false;
    }

    return webpEncodeSupported;
}

export default function compressImage(
    file: File,
    options: Compressor.Options = {},
): Promise<File | Blob> {
    return new Promise((resolve, reject) => {
        new Compressor(file, {
            // Phone camera photos are huge; cap them at a size that still
            // looks sharp full-screen on a high-DPI phone.
            quality: 0.8,
            maxWidth: 1600,
            maxHeight: 1600,
            mimeType: canEncodeWebp() ? "image/webp" : "image/jpeg",
            ...options,
            success: resolve,
            error: reject,
        });
    });
}
