/**
 * Reads chat attachments on the relay, so a phone only uploads bytes and never
 * runs pdf.js (or ships its CMaps) itself.
 *
 * Text-ish files are decoded as UTF-8. PDFs are parsed with pdf.js on the
 * server, using the CMaps and standard fonts bundled in node_modules: without
 * them Chinese PDFs extract as an empty string, which used to send a blank
 * attachment. A PDF with no text layer (a phone scan) is rendered to JPEG
 * pages instead, for the vision models.
 *
 * Everything stays in memory: the relay does not persist uploads. Limits are
 * enforced here and by the caller (see `AI_FILES_PATH` in ai-relay.ts).
 */

import { createRequire } from "node:module";
import path from "node:path";

import type { PDFDocumentProxy } from "pdfjs-dist/legacy/build/pdf.mjs";

import {
    MAX_FILE_BYTES,
    MAX_FILE_CHARS,
    MAX_PDF_PAGES,
    MAX_PAGE_IMAGES,
    isAllowedFileSize,
    isPdfFileName,
    isSupportedFileName,
    sanitizeFileName,
} from "../lib/chat-files";

export const AI_FILES_PATH = "/ai/files";

/** Stop pulling text/pages out of a pathological PDF after this long. */
const MAX_PDF_MS = 60_000;
/** Long edge of a rendered scan page; enough for the vision model to read. */
const MAX_PAGE_EDGE = 1280;
const PAGE_JPEG_QUALITY = 72;

export type ExtractedFile = {
    name: string;
    kind: "text" | "pdf";
    content: string;
    truncated: boolean;
    /** JPEG data URLs for a PDF without a text layer. */
    images?: string[];
};

/** A failure the upload endpoint can show to the user verbatim. */
export class FileReadError extends Error {
    status: number;

    constructor(message: string, status = 400) {
        super(message);
        this.name = "FileReadError";
        this.status = status;
    }
}

/** Absolute paths to the runtime assets pdf.js looks up while parsing. */
const require = createRequire(import.meta.url);
const pdfjsRoot = path.dirname(require.resolve("pdfjs-dist/package.json"));
const CMAP_URL = `${path.join(pdfjsRoot, "cmaps")}${path.sep}`;
const STANDARD_FONT_URL = `${path.join(pdfjsRoot, "standard_fonts")}${path.sep}`;

function hasPdfHeader(data: Uint8Array): boolean {
    // `%PDF-` may be preceded by a small amount of junk in real-world files.
    const head = data.subarray(0, 1024);
    return new TextDecoder("latin1").decode(head).includes("%PDF-");
}

function isBinary(data: Uint8Array): boolean {
    // NUL bytes are a cheap, reliable binary signal for the text extensions.
    const head = data.subarray(0, 4096);
    return head.includes(0);
}

export async function extractUploadedFile(
    rawName: string,
    data: Uint8Array,
    options: { pageImageLimit?: number } = {},
): Promise<ExtractedFile> {
    const name = sanitizeFileName(rawName);
    if (!isSupportedFileName(name)) {
        throw new FileReadError("不支持这种文件类型");
    }
    if (!isAllowedFileSize(data.byteLength)) {
        if (data.byteLength === 0) {
            throw new FileReadError("文件是空的");
        }
        throw new FileReadError(
            `文件太大了（最大 ${Math.round(MAX_FILE_BYTES / 1024 / 1024)}MB）`,
            413,
        );
    }
    if (isPdfFileName(name)) {
        return extractPdf(name, data, options.pageImageLimit ?? 0);
    }
    return extractText(name, data);
}

function extractText(name: string, data: Uint8Array): ExtractedFile {
    if (isBinary(data)) {
        throw new FileReadError("这个文件看起来不是文本");
    }
    const text = new TextDecoder("utf-8").decode(data);
    if (text.trim() === "") {
        throw new FileReadError("这个文件是空的");
    }
    return {
        name,
        kind: "text",
        content: text.slice(0, MAX_FILE_CHARS),
        truncated: text.length > MAX_FILE_CHARS,
    };
}

async function extractPdf(
    name: string,
    data: Uint8Array,
    pageImageLimit: number,
): Promise<ExtractedFile> {
    if (!hasPdfHeader(data)) {
        throw new FileReadError("这个文件不是有效的 PDF");
    }

    const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
    let doc;
    try {
        doc = await pdfjs.getDocument({
            data,
            cMapUrl: CMAP_URL,
            cMapPacked: true,
            standardFontDataUrl: STANDARD_FONT_URL,
            // Parsing happens in the key-holding supervisor process; don't
            // evaluate font programs from an untrusted file.
            isEvalSupported: false,
            disableFontFace: true,
            disableAutoFetch: true,
            disableStream: true,
        }).promise;
    } catch (error) {
        const kind = (error as { name?: string } | null)?.name;
        if (kind === "PasswordException") {
            throw new FileReadError("这个 PDF 有密码，先取消密码再试");
        }
        throw new FileReadError("这个 PDF 打不开，可能文件损坏了");
    }

    const deadline = Date.now() + MAX_PDF_MS;
    try {
        if (doc.numPages === 0) throw new FileReadError("这个 PDF 没有页面");

        const pages = Math.min(doc.numPages, MAX_PDF_PAGES);
        let text = "";
        let timedOut = false;
        for (let index = 1; index <= pages; index++) {
            if (Date.now() > deadline) {
                timedOut = true;
                break;
            }
            const page = await doc.getPage(index);
            const content = await page.getTextContent();
            text +=
                content.items
                    .map((item) => ("str" in item ? item.str : ""))
                    .join(" ") + "\n";
            page.cleanup();
            if (text.length > MAX_FILE_CHARS) break;
        }

        text = text.replace(/[ \t]+/g, " ").trim();
        if (text !== "") {
            return {
                name,
                kind: "pdf",
                content: text.slice(0, MAX_FILE_CHARS),
                truncated:
                    timedOut ||
                    text.length > MAX_FILE_CHARS ||
                    doc.numPages > pages,
            };
        }
        if (timedOut) {
            throw new FileReadError(
                "这个 PDF 有点大，读取超时了；试试只发前几页",
            );
        }

        const limit = Math.max(
            0,
            Math.min(MAX_PAGE_IMAGES, Math.floor(pageImageLimit)),
        );
        if (limit === 0) {
            throw new FileReadError(
                "这个 PDF 没有文字层（可能是扫描件），需要发送图片才能读；换个支持图片的模型或移除几张图片再试",
            );
        }

        const images = await renderPdfPages(doc, limit, deadline);
        if (images.length === 0) {
            throw new FileReadError("这个 PDF 读不出内容（可能是扫描件）");
        }
        return {
            name,
            kind: "pdf",
            content: "",
            truncated: doc.numPages > images.length,
            images,
        };
    } finally {
        void doc.destroy();
    }
}

async function renderPdfPages(
    doc: PDFDocumentProxy,
    limit: number,
    deadline: number,
): Promise<string[]> {
    let createCanvas: typeof import("@napi-rs/canvas").createCanvas;
    try {
        // Native and installed for the linux host; importing it lazily keeps
        // the supervisor alive (and text attachments working) if a deploy
        // predates the dependency.
        ({ createCanvas } = await import("@napi-rs/canvas"));
    } catch {
        throw new FileReadError(
            "扫描件暂时读不了，先把 PDF 转成文字或图片再发",
        );
    }

    const images: string[] = [];
    const pages = Math.min(doc.numPages, limit);
    for (let index = 1; index <= pages; index++) {
        if (Date.now() > deadline) break;
        const page = await doc.getPage(index);
        const base = page.getViewport({ scale: 1 });
        const scale = Math.min(
            2,
            MAX_PAGE_EDGE / Math.max(base.width, base.height),
        );
        const viewport = page.getViewport({ scale });
        const canvas = createCanvas(
            Math.ceil(viewport.width),
            Math.ceil(viewport.height),
        );
        const context = canvas.getContext("2d");
        // @napi-rs/canvas implements the 2D context pdf.js renders into; its
        // type omits drawFocusIfNeeded, which pdf.js never calls.
        await page.render({
            canvasContext: context as unknown as CanvasRenderingContext2D,
            viewport,
        }).promise;
        const jpeg = await canvas.encode("jpeg", PAGE_JPEG_QUALITY);
        images.push(
            `data:image/jpeg;base64,${Buffer.from(jpeg).toString("base64")}`,
        );
        page.cleanup();
    }
    return images;
}
