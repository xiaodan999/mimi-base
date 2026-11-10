/**
 * Reads chat attachments on the relay, so a phone only uploads bytes and never
 * runs pdf.js (or ships its CMaps) itself.
 *
 * Text-ish files are decoded as UTF-8. PDFs are parsed with pdf.js on the
 * server, using the CMaps and standard fonts bundled in node_modules: without
 * them Chinese PDFs extract as an empty string, which used to send a blank
 * attachment. Vision-capable callers also get the first pages rendered to
 * JPEG (text extraction flattens tables and layout); a PDF with no text layer
 * (a phone scan) is page images only.
 *
 * The bytes themselves are persisted by the client in `chat_attachments`
 * (owner-scoped, protected file); the relay reads that stored copy for both
 * the first extraction and later `read_attachment` calls. Limits are enforced
 * here and by the caller (see `AI_FILES_PATH` in ai-relay.ts).
 */

import { createRequire } from "node:module";
import path from "node:path";

import type { PDFDocumentProxy } from "pdfjs-dist/legacy/build/pdf.mjs";

import {
    isAllowedFileSize,
    isPdfFileName,
    isSupportedFileName,
    MAX_FILE_BYTES,
    MAX_FILE_CHARS,
    MAX_PAGE_IMAGES,
    MAX_PDF_PAGES,
    parsePageSpec,
    PDF_NO_TEXT_LAYER_CODE,
    sanitizeFileName,
} from "../lib/chat-files";

export const AI_FILES_PATH = "/api/ai/files";

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
    /** Total PDF pages, so the client can show 尺寸 and offer the rest. */
    numPages?: number;
    /** 1-based page numbers of `images`, set by the pages-mode read. */
    pages?: number[];
    /**
     * JPEG data URLs for rendered pages. Vision models get the first pages of
     * every PDF (tables and layout survive what text extraction mangles);
     * text-only callers ask for none.
     */
    images?: string[];
};

/** A failure the upload endpoint can show to the user verbatim. */
export class FileReadError extends Error {
    status: number;
    /**
     * Machine-readable kind, relayed to the client so it can react (the
     * `read_attachment` tool retries a no-text-layer PDF with page images
     * when the model is vision-capable) instead of matching on the copy.
     */
    code?: string;

    constructor(message: string, status = 400, code?: string) {
        super(message);
        this.name = "FileReadError";
        this.status = status;
        this.code = code;
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

/** Open a PDF with the shared error mapping; caller destroys the doc. */
async function openPdf(data: Uint8Array): Promise<PDFDocumentProxy> {
    if (!hasPdfHeader(data)) {
        throw new FileReadError("这个文件不是有效的 PDF");
    }
    const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
    try {
        return await pdfjs.getDocument({
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
}

async function extractPdf(
    name: string,
    data: Uint8Array,
    pageImageLimit: number,
): Promise<ExtractedFile> {
    const doc = await openPdf(data);
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
        if (text === "" && timedOut) {
            throw new FileReadError(
                "这个 PDF 有点大，读取超时了；试试只发前几页",
            );
        }

        // Vision-first: a vision-capable caller (pageImageLimit > 0) gets the
        // first pages as images alongside the text — text extraction flattens
        // tables and layout, the page bitmap does not. Text-only callers get
        // text alone; a scan (no text layer) still requires images.
        const limit = Math.max(
            0,
            Math.min(MAX_PAGE_IMAGES, Math.floor(pageImageLimit)),
        );
        let images: string[] = [];
        if (limit > 0) {
            images = await renderPdfPages(
                doc,
                rangePages(1, Math.min(doc.numPages, limit)),
                deadline,
            );
        }
        if (text === "" && images.length === 0) {
            if (limit === 0) {
                // The caller asked for text only, so this reads as "model
                // can't take images" — but a vision-capable caller hits it
                // too via read_attachment mode=text; the code lets the
                // client retry with page images instead of blaming it.
                throw new FileReadError(
                    "这个 PDF 没有文字层（可能是扫描件），读不出文字；换一个支持视觉的模型再试",
                    400,
                    PDF_NO_TEXT_LAYER_CODE,
                );
            }
            throw new FileReadError("这个 PDF 读不出内容（可能是扫描件）");
        }

        return {
            name,
            kind: "pdf",
            content: text.slice(0, MAX_FILE_CHARS),
            truncated:
                timedOut ||
                text.length > MAX_FILE_CHARS ||
                doc.numPages > pages ||
                doc.numPages > images.length,
            numPages: doc.numPages,
            ...(images.length > 0 ? { images } : {}),
        };
    } finally {
        void doc.destroy();
    }
}

/**
 * Render specific pages of a stored PDF (`read_attachment` mode=pages). Page
 * numbers come from the model, so they are clamped through `parsePageSpec`
 * before anything is rendered.
 */
export async function extractPdfPageImages(
    rawName: string,
    data: Uint8Array,
    spec: string,
): Promise<ExtractedFile> {
    const name = sanitizeFileName(rawName);
    if (!isPdfFileName(name)) {
        throw new FileReadError("只有 PDF 才能按页读取");
    }
    if (!isAllowedFileSize(data.byteLength)) {
        throw new FileReadError("文件太大了，读不了", 413);
    }
    const doc = await openPdf(data);
    const deadline = Date.now() + MAX_PDF_MS;
    try {
        if (doc.numPages === 0) throw new FileReadError("这个 PDF 没有页面");
        const pages = parsePageSpec(spec, doc.numPages);
        if (pages.length === 0) {
            throw new FileReadError(
                `页码不对；这个 PDF 共 ${doc.numPages} 页，用 1-${doc.numPages} 之间的页码`,
            );
        }
        const images = await renderPdfPages(doc, pages, deadline);
        if (images.length === 0) {
            throw new FileReadError("这几页渲染不出来，换几页试试");
        }
        return {
            name,
            kind: "pdf",
            content: "",
            truncated: false,
            numPages: doc.numPages,
            pages: pages.slice(0, images.length),
            images,
        };
    } finally {
        void doc.destroy();
    }
}

function rangePages(from: number, to: number): number[] {
    const pages: number[] = [];
    for (let page = from; page <= to; page++) pages.push(page);
    return pages;
}

async function renderPdfPages(
    doc: PDFDocumentProxy,
    pages: readonly number[],
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
    for (const pageNumber of pages) {
        if (Date.now() > deadline) break;
        const page = await doc.getPage(pageNumber);
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
