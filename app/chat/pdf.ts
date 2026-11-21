/**
 * Browser-side PDF rendering for chat attachments.
 *
 * The phone parses the PDF and rasterizes the first pages itself; nothing is
 * extracted as text and no bytes leave the device for parsing. `pdf-browser`
 * (and therefore pdf.js) is loaded only when this module actually renders a
 * document, so the shell and unit tests never pay for it.
 *
 * Rendering mirrors the config the old server parser used: a 1280px long edge
 * and JPEG quality 0.72, which is enough for a vision model to read tables
 * and scans. CMaps and standard fonts are served by the Vite plugin under
 * `/pdfjs/`; without them some Chinese and non-embedded fonts render blank.
 */

import type { PDFDocumentProxy } from "pdfjs-dist";

import { parsePageSpec } from "@/lib/chat-files";

/** Long edge of a rendered page; enough for the vision model to read. */
const MAX_PAGE_EDGE = 1280;
const PAGE_JPEG_QUALITY = 0.72;
/** Give up on a pathological document after this long. */
const MAX_RENDER_MS = 60_000;

export type RenderedPdfPages = {
    name: string;
    numPages: number;
    pages: number[];
    images: string[];
};

export type PdfAttachmentRead = {
    numPages: number;
    pageImages: string[];
};

/**
 * Scale that keeps the page's long edge at MAX_PAGE_EDGE, capped at 2x so a
 * tiny page does not turn into an oversized bitmap.
 */
export function renderScale(width: number, height: number): number {
    const edge = Math.max(width, height);
    if (!Number.isFinite(edge) || edge <= 0) return 1;
    return Math.min(2, MAX_PAGE_EDGE / edge);
}

/** Pages 1..limit, clamped to the document. */
export function firstPages(limit: number, numPages: number): number[] {
    const count = Number.isFinite(limit) ? Math.floor(limit) : 0;
    const end = Math.max(0, Math.min(numPages, count));
    return Array.from({ length: end }, (_, index) => index + 1);
}

async function openPdf(
    data: Uint8Array | ArrayBuffer,
): Promise<PDFDocumentProxy> {
    const { pdfjs } = await import("./pdf-browser");
    try {
        return await pdfjs.getDocument({
            data,
            cMapUrl: "/pdfjs/cmaps/",
            cMapPacked: true,
            standardFontDataUrl: "/pdfjs/standard_fonts/",
        }).promise;
    } catch (error) {
        const name = (error as { name?: string } | null)?.name;
        if (name === "PasswordException") {
            throw new Error("这个 PDF 有密码，先取消密码再试");
        }
        throw new Error("这个 PDF 打不开，可能文件损坏了");
    }
}

function toJpegDataUrl(canvas: HTMLCanvasElement): Promise<string> {
    return new Promise((resolve, reject) => {
        canvas.toBlob(
            (blob) => {
                if (!blob) {
                    reject(new Error("页面图片生成失败，再试一次"));
                    return;
                }
                const reader = new FileReader();
                reader.onload = () => {
                    if (typeof reader.result === "string") {
                        resolve(reader.result);
                        return;
                    }
                    reject(new Error("页面图片生成失败，再试一次"));
                };
                reader.onerror = () =>
                    reject(new Error("页面图片生成失败，再试一次"));
                reader.readAsDataURL(blob);
            },
            "image/jpeg",
            PAGE_JPEG_QUALITY,
        );
    });
}

async function renderPages(
    doc: PDFDocumentProxy,
    pages: readonly number[],
    deadline: number,
): Promise<string[]> {
    const images: string[] = [];
    for (const pageNumber of pages) {
        if (Date.now() > deadline) {
            throw new Error("这个 PDF 有点大，渲染超时了；试试只发前几页");
        }
        const page = await doc.getPage(pageNumber);
        try {
            const base = page.getViewport({ scale: 1 });
            const viewport = page.getViewport({
                scale: renderScale(base.width, base.height),
            });
            const canvas = document.createElement("canvas");
            canvas.width = Math.ceil(viewport.width);
            canvas.height = Math.ceil(viewport.height);
            if (!canvas.getContext("2d")) {
                throw new Error("这台设备暂时无法渲染 PDF");
            }
            try {
                await page.render({ canvas, viewport }).promise;
                images.push(await toJpegDataUrl(canvas));
            } finally {
                // Release the backing store before the next page; mobile
                // Safari keeps canvases alive until the dimensions are reset.
                canvas.width = 0;
                canvas.height = 0;
            }
        } finally {
            page.cleanup();
        }
    }
    return images;
}

/** Parse a PDF once and render its first `pageImageLimit` pages. */
export async function readPdfAttachment(
    data: Uint8Array | ArrayBuffer,
    pageImageLimit: number,
): Promise<PdfAttachmentRead> {
    const doc = await openPdf(data);
    try {
        const pageImages = await renderPages(
            doc,
            firstPages(pageImageLimit, doc.numPages),
            Date.now() + MAX_RENDER_MS,
        );
        return { numPages: doc.numPages, pageImages };
    } finally {
        // Never mask the real render error with a teardown failure.
        await doc.destroy().catch(() => {});
    }
}

/** Render the pages named by a spec like "3" or "2-5" from a stored PDF. */
export async function renderPdfPages(
    data: Uint8Array | ArrayBuffer,
    spec: string,
    name: string,
): Promise<RenderedPdfPages> {
    const doc = await openPdf(data);
    try {
        const pages = parsePageSpec(spec, doc.numPages);
        if (pages.length === 0) {
            throw new Error("这些页码超出了 PDF 的范围");
        }
        const images = await renderPages(
            doc,
            pages,
            Date.now() + MAX_RENDER_MS,
        );
        return { name, numPages: doc.numPages, pages, images };
    } finally {
        await doc.destroy().catch(() => {});
    }
}
