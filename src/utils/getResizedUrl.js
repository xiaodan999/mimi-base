const RESIZE_API_ENDPOINT = "https://api.xiaohai-huang.net/api/image";

export default function getResizedUrl(url, width, height) {
  const newURL = new URL(RESIZE_API_ENDPOINT);
  newURL.searchParams.append("url", url);
  width && newURL.searchParams.append("width", width);
  height && newURL.searchParams.append("height", height);
  return newURL.toString();
}
