import Compressor from "compressorjs";

export default function compressImage(file, options) {
  return new Promise((resolve) => {
    new Compressor(file, {
      quality: 0.1,
      mimeType: "image/webp",
      async success(compressed) {
        resolve(compressed);
      },
      error(error) {
        throw error;
      },
      ...options,
    });
  });
}
