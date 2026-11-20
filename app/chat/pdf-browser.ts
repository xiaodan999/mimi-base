/**
 * pdf.js browser entry. This is the only module with a static pdf.js import,
 * and it is reached exclusively through `await import("./pdf-browser")` from
 * `pdf.ts`: the `?url` worker import is Vite-only, so `bun test` must never
 * load this file. Keeping the import behind a function also keeps pdf.js out
 * of the shell chunk until a PDF is actually rendered.
 */

import * as pdfjs from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

export { pdfjs };
