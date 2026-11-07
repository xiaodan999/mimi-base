/**
 * Pure helpers for the artifacts a chat run hands to the user.
 *
 * Text files live in the conversation sandbox (`sandbox_files`, path -> text)
 * and are rendered from there; binary images come back once with the run
 * response and are uploaded to `chat_artifacts`. Nothing here touches
 * PocketBase or the DOM, so the classification/preview rules are unit-tested.
 */

import type { SandboxFiles } from "@/lib/sandbox-protocol";

import type { ChatArtifactPart } from "./types";

export type TextArtifactKind =
    "html" | "markdown" | "csv" | "json" | "svg" | "code" | "text";

type TextArtifactInfo = {
    /** Last path segment, suitable for a card title and a download. */
    name: string;
    kind: TextArtifactKind;
    mime: string;
};

const EXTENSION_INFO: Record<string, { kind: TextArtifactKind; mime: string }> =
    {
        html: { kind: "html", mime: "text/html" },
        htm: { kind: "html", mime: "text/html" },
        md: { kind: "markdown", mime: "text/markdown" },
        markdown: { kind: "markdown", mime: "text/markdown" },
        csv: { kind: "csv", mime: "text/csv" },
        tsv: { kind: "csv", mime: "text/tab-separated-values" },
        json: { kind: "json", mime: "application/json" },
        svg: { kind: "svg", mime: "image/svg+xml" },
        txt: { kind: "text", mime: "text/plain" },
        log: { kind: "text", mime: "text/plain" },
        js: { kind: "code", mime: "text/javascript" },
        mjs: { kind: "code", mime: "text/javascript" },
        cjs: { kind: "code", mime: "text/javascript" },
        jsx: { kind: "code", mime: "text/javascript" },
        ts: { kind: "code", mime: "text/typescript" },
        tsx: { kind: "code", mime: "text/typescript" },
        css: { kind: "code", mime: "text/css" },
        py: { kind: "code", mime: "text/x-python" },
        java: { kind: "code", mime: "text/x-java" },
        go: { kind: "code", mime: "text/x-go" },
        rs: { kind: "code", mime: "text/x-rust" },
        sh: { kind: "code", mime: "text/x-shellscript" },
        sql: { kind: "code", mime: "text/x-sql" },
        xml: { kind: "code", mime: "application/xml" },
        yaml: { kind: "code", mime: "text/yaml" },
        yml: { kind: "code", mime: "text/yaml" },
    };

/** Raster extensions the sandbox sends as binary artifacts, never as text. */
const IMAGE_EXTENSIONS = new Set([
    "png",
    "jpg",
    "jpeg",
    "webp",
    "gif",
    "bmp",
    "avif",
    "heic",
    "heif",
]);

function extensionOf(path: string): string {
    const name = path.split("/").pop() ?? path;
    const dot = name.lastIndexOf(".");
    return dot > 0 ? name.slice(dot + 1).toLowerCase() : "";
}

export function textArtifactInfo(path: string): TextArtifactInfo {
    const name = path.split("/").pop() || path;
    const info = EXTENSION_INFO[extensionOf(path)] ?? {
        kind: "text" as const,
        mime: "text/plain",
    };
    return { name, ...info };
}

export function isBinaryArtifactPath(path: string): boolean {
    return IMAGE_EXTENSIONS.has(extensionOf(path));
}

export function formatBytes(bytes: number): string {
    if (!Number.isFinite(bytes) || bytes <= 0) return "";
    if (bytes < 1024) return `${Math.round(bytes)} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Files added or changed by a sandbox call. Removals are ignored: there is
 * nothing left to preview.
 */
export function changedPaths(
    before: SandboxFiles,
    after: SandboxFiles,
): string[] {
    return Object.keys(after)
        .filter((path) => before[path] !== after[path])
        .sort();
}

const UNSAFE_FILENAME_CHARS = '\\/:*?"<>|';

/** A safe download filename that keeps Chinese names readable. */
export function artifactFileName(path: string): string {
    const name = path.split("/").pop() || "文件";
    const cleaned = Array.from(name)
        .map((char) => {
            const code = char.charCodeAt(0);
            return UNSAFE_FILENAME_CHARS.includes(char) ||
                code < 32 ||
                code === 127
                ? "_"
                : char;
        })
        .join("")
        .trim()
        .slice(0, 120);
    return cleaned || "文件";
}

/** PocketBase file-field name for an uploaded artifact. */
export function uploadFileName(name: string): string {
    return artifactFileName(name).replace(/\s+/g, " ").slice(0, 120);
}

/**
 * The CSP used by the sandboxed HTML preview. `default-src 'none'` also
 * blocks scripts (no `script-src` is allowed), so even if the iframe ever
 * gains `allow-scripts` the document still cannot run code or call out.
 */
const PREVIEW_CSP =
    "default-src 'none'; img-src data: blob:; style-src 'unsafe-inline'; " +
    "font-src data:; media-src data: blob:; form-action 'none'; base-uri 'none'";

const CSP_META = `<meta http-equiv="Content-Security-Policy" content="${PREVIEW_CSP}">`;

/**
 * Turn generated HTML into a document that is safe to render in a
 * `<iframe sandbox="">`: drop self-navigation (`meta refresh`, `<base>`) and
 * inject a CSP that blocks remote resources. The iframe's opaque origin is
 * still the real security boundary; this just keeps a preview from loading
 * tracking pixels or wandering off.
 */
export function prepareHtmlPreview(source: string): string {
    let html = source
        .replace(/^\s*<\?xml[^>]*\?>/i, "")
        .replace(/<meta\b[^>]*http-equiv\s*=\s*["']?refresh["']?[^>]*>/gi, "")
        .replace(/<base\b[^>]*>/gi, "");
    if (/<head[^>]*>/i.test(html)) {
        html = html.replace(/<head[^>]*>/i, (match) => `${match}${CSP_META}`);
    } else if (/<html[^>]*>/i.test(html)) {
        html = html.replace(
            /<html[^>]*>/i,
            (match) => `${match}<head>${CSP_META}</head>`,
        );
    } else {
        html = `<!doctype html><html><head>${CSP_META}</head><body>${html}</body></html>`;
    }
    return html;
}

/** Pretty-print JSON for the text preview; invalid JSON stays as-is. */
export function prettyJson(source: string): string {
    try {
        return JSON.stringify(JSON.parse(source), null, 2);
    } catch {
        return source;
    }
}

/** Decode the runner's standard base64 into bytes for a PB upload. */
export function base64ToBytes(value: string): Uint8Array {
    const binary = atob(value);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index++) {
        bytes[index] = binary.charCodeAt(index);
    }
    return bytes;
}

/** A durable text artifact card; its content stays in the sandbox snapshot. */
export function sandboxArtifactPart(
    path: string,
    caption?: string,
): ChatArtifactPart {
    const info = textArtifactInfo(path);
    const cleanCaption = caption?.trim().slice(0, 200) ?? "";
    return {
        type: "artifact",
        source: "sandbox",
        path,
        name: info.name,
        mime: info.mime,
        ...(cleanCaption ? { caption: cleanCaption } : {}),
    };
}
