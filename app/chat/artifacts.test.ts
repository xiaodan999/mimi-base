import { describe, expect, test } from "bun:test";

import {
    artifactFileName,
    base64ToBytes,
    changedPaths,
    formatBytes,
    isBinaryArtifactPath,
    prepareHtmlPreview,
    prettyJson,
    sandboxArtifactPart,
    textArtifactInfo,
    uploadFileName,
} from "./artifacts";

describe("textArtifactInfo", () => {
    test("classifies the previewable types", () => {
        expect(textArtifactInfo("out/invoice.html")).toEqual({
            name: "invoice.html",
            kind: "html",
            mime: "text/html",
        });
        expect(textArtifactInfo("notes/a.md")).toMatchObject({
            kind: "markdown",
            mime: "text/markdown",
        });
        expect(textArtifactInfo("data/report.csv")).toMatchObject({
            kind: "csv",
            mime: "text/csv",
        });
        expect(textArtifactInfo("data/x.json")).toMatchObject({
            kind: "json",
            mime: "application/json",
        });
        expect(textArtifactInfo("logo.svg")).toMatchObject({
            kind: "svg",
            mime: "image/svg+xml",
        });
        expect(textArtifactInfo("main.py")).toMatchObject({
            kind: "code",
            mime: "text/x-python",
        });
    });

    test("falls back to plain text for unknown extensions", () => {
        expect(textArtifactInfo("notes/readme")).toEqual({
            name: "readme",
            kind: "text",
            mime: "text/plain",
        });
        expect(textArtifactInfo("a.bin")).toMatchObject({ kind: "text" });
    });
});

describe("isBinaryArtifactPath", () => {
    test("matches raster images only", () => {
        expect(isBinaryArtifactPath("chart.png")).toBe(true);
        expect(isBinaryArtifactPath("photo.JPG")).toBe(true);
        expect(isBinaryArtifactPath("x.webp")).toBe(true);
        expect(isBinaryArtifactPath("logo.svg")).toBe(false);
        expect(isBinaryArtifactPath("out.html")).toBe(false);
    });
});

describe("prepareHtmlPreview", () => {
    test("injects the CSP into the head", () => {
        const prepared = prepareHtmlPreview(
            "<!doctype html><html><head><title>x</title></head><body></body></html>",
        );
        expect(prepared).toContain('http-equiv="Content-Security-Policy"');
        expect(prepared).toContain("default-src 'none'");
        const headAt = prepared.indexOf("<head>");
        const metaAt = prepared.indexOf("Content-Security-Policy");
        expect(metaAt).toBeGreaterThan(headAt);
    });

    test("strips meta refresh and base tags", () => {
        const prepared = prepareHtmlPreview(
            '<html><head><base href="https://evil.example/"><meta http-equiv="refresh" content="0;url=https://evil.example/"></head></html>',
        );
        expect(prepared).not.toContain("<base");
        expect(prepared.toLowerCase()).not.toContain('http-equiv="refresh"');
    });

    test("wraps a bare fragment in a document", () => {
        const prepared = prepareHtmlPreview("<p>hello</p>");
        expect(prepared.startsWith("<!doctype html>")).toBe(true);
        expect(prepared).toContain("Content-Security-Policy");
        expect(prepared).toContain("<p>hello</p>");
    });

    test("keeps an SVG fragment out of the XML declaration path", () => {
        const prepared = prepareHtmlPreview(
            '<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg"></svg>',
        );
        expect(prepared).not.toContain("<?xml");
        expect(prepared).toContain("<svg");
    });
});

describe("changedPaths", () => {
    test("reports added and modified files only", () => {
        expect(
            changedPaths(
                { "a.txt": "1", "b.txt": "2" },
                { "a.txt": "1", "b.txt": "3", "c.txt": "4" },
            ),
        ).toEqual(["b.txt", "c.txt"]);
    });
});

describe("formatBytes", () => {
    test("scales B, KB and MB", () => {
        expect(formatBytes(0)).toBe("");
        expect(formatBytes(512)).toBe("512 B");
        expect(formatBytes(2048)).toBe("2.0 KB");
        expect(formatBytes(2 * 1024 * 1024)).toBe("2.0 MB");
    });
});

describe("prettyJson", () => {
    test("pretty-prints valid JSON and leaves bad input alone", () => {
        expect(prettyJson('{"a":1}')).toBe('{\n  "a": 1\n}');
        expect(prettyJson("{not json")).toBe("{not json");
    });
});

describe("base64ToBytes", () => {
    test("decodes standard base64", () => {
        expect(Array.from(base64ToBytes("aGk="))).toEqual([104, 105]);
    });
});

describe("artifactFileName", () => {
    test("keeps the last segment and strips unsafe characters", () => {
        expect(artifactFileName("out/账单 2026.html")).toBe("账单 2026.html");
        expect(artifactFileName("a/b:c*?.txt")).toBe("b_c__.txt");
        expect(artifactFileName("")).toBe("文件");
    });
});

describe("uploadFileName", () => {
    test("keeps a usable PocketBase file name", () => {
        expect(uploadFileName("out/chart.png")).toBe("chart.png");
        expect(uploadFileName("a/../b.png")).toBe("b.png");
    });
});

describe("sandboxArtifactPart", () => {
    test("builds a sandbox-sourced artifact part", () => {
        expect(sandboxArtifactPart("out/invoice.html", "  ")).toEqual({
            type: "artifact",
            source: "sandbox",
            path: "out/invoice.html",
            name: "invoice.html",
            mime: "text/html",
        });
        expect(sandboxArtifactPart("out/a.md", "说明")).toMatchObject({
            caption: "说明",
        });
    });
});
