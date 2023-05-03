const RESIZE_API_ENDPOINT = "https://api.xiaohai-huang.net/api/image";

export default function getResizedUrl({ url, width, height, format = "webp", fit }) {
  const newURL = new URL(RESIZE_API_ENDPOINT);
  newURL.searchParams.append("url", encodeURIComponent(url));
  width && newURL.searchParams.append("width", width);
  height && newURL.searchParams.append("height", height);
  format && newURL.searchParams.append("format", format);
  fit && newURL.searchParams.append("fit", fit);

  return newURL.toString();
}
