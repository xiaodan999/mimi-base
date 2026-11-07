/**
 * Document attachments for the chat composer: text-ish files are read as
 * text, PDFs are extracted with pdf.js (lazy-loaded, own chunk). The content
 * becomes a fenced text part on the message — no vision capability needed.
 */

export const MAX_ATTACHMENTS = 3;
export const MAX_FILE_CHARS = 50_000;
export const MAX_PDF_PAGES = 20;

export const FILE_ACCEPT =
    ".txt,.md,.markdown,.csv,.json,.log,.xml,.yaml,.yml,.html,.css,.js,.jsx,.ts,.tsx,.py,.java,.go,.rs,.sql,.sh,.pdf";

export type ExtractedFile = {
    name: string;
    kind: "text" | "pdf";
    content: string;
    truncated: boolean;
};

export async function extractFileText(file: File): Promise<ExtractedFile> {
    const isPdf =
        file.type === "application/pdf" ||
        file.name.toLowerCase().endsWith(".pdf");
    if (isPdf) return extractPdf(file);
    const text = await file.text();
    return {
        name: file.name,
        kind: "text",
        content: text.slice(0, MAX_FILE_CHARS),
        truncated: text.length > MAX_FILE_CHARS,
    };
}

/** The fenced block appended to the message text for one attachment. */
export function attachmentToMessageText(file: ExtractedFile): string {
    const header = `[附件 ${file.name}${file.truncated ? "（内容过长，已截断）" : ""}]`;
    return `${header}\n\`\`\`\n${file.content}\n\`\`\``;
}

async function extractPdf(file: File): Promise<ExtractedFile> {
    const pdfjs = await import("pdfjs-dist");
    const worker = (await import("pdfjs-dist/build/pdf.worker.min.mjs?url"))
        .default;
    pdfjs.GlobalWorkerOptions.workerSrc = worker;

    const buffer = await file.arrayBuffer();
    const doc = await pdfjs.getDocument({ data: buffer }).promise;
    const totalPages = doc.numPages;
    const pages = Math.min(totalPages, MAX_PDF_PAGES);
    let text = "";
    for (let index = 1; index <= pages; index++) {
        const page = await doc.getPage(index);
        const content = await page.getTextContent();
        text +=
            content.items
                .map((item) => ("str" in item ? item.str : ""))
                .join(" ") + "\n";
        if (text.length > MAX_FILE_CHARS) break;
    }
    void doc.destroy();
    text = text.replace(/[ \t]+/g, " ").trim();
    return {
        name: file.name,
        kind: "pdf",
        content: text.slice(0, MAX_FILE_CHARS),
        truncated: text.length > MAX_FILE_CHARS || totalPages > MAX_PDF_PAGES,
    };
}
