import { describe, expect, test } from "bun:test";

import {
    MAX_ARTIFACT_BYTES,
    MAX_CODE_CHARS,
    MAX_FILE_CHARS,
    normalizeArtifactMime,
    normalizeSandboxLanguage,
    normalizeSandboxPath,
    sanitizeArtifacts,
    sanitizeFiles,
    validateSandboxCode,
} from "./sandbox-protocol";

describe("normalizeSandboxPath", () => {
    test("accepts relative nested paths", () => {
        expect(normalizeSandboxPath("notes/today.md")).toBe("notes/today.md");
        expect(normalizeSandboxPath("./a.txt")).toBe("a.txt");
        expect(normalizeSandboxPath("  b.txt  ")).toBe("b.txt");
    });

    test("rejects escapes and absolute paths", () => {
        expect(normalizeSandboxPath("../secret")).toBeNull();
        expect(normalizeSandboxPath("a/../../b")).toBeNull();
        expect(normalizeSandboxPath("/etc/passwd")).toBeNull();
        expect(normalizeSandboxPath("a\\b")).toBeNull();
        expect(normalizeSandboxPath("a//b")).toBeNull();
        expect(normalizeSandboxPath("a\u0000b")).toBeNull();
        expect(normalizeSandboxPath("")).toBeNull();
        expect(normalizeSandboxPath("x".repeat(201))).toBeNull();
        expect(normalizeSandboxPath(42)).toBeNull();
    });
});

describe("sanitizeFiles", () => {
    test("keeps valid entries and drops junk", () => {
        const files = sanitizeFiles({
            "a.txt": "hello",
            "../b.txt": "nope",
            "c.txt": 123,
            "d.txt": "x".repeat(MAX_FILE_CHARS + 10),
        });
        expect(files["a.txt"]).toBe("hello");
        expect(files["../b.txt"]).toBeUndefined();
        expect(files["c.txt"]).toBeUndefined();
        expect(files["d.txt"]?.length).toBe(MAX_FILE_CHARS);
    });

    test("non-objects become an empty snapshot", () => {
        expect(sanitizeFiles(null)).toEqual({});
        expect(sanitizeFiles("x")).toEqual({});
        expect(sanitizeFiles([])).toEqual({});
    });
});

describe("normalizeSandboxLanguage", () => {
    test("defaults to python and accepts javascript", () => {
        expect(normalizeSandboxLanguage(undefined)).toBe("python");
        expect(normalizeSandboxLanguage("")).toBe("python");
        expect(normalizeSandboxLanguage("python")).toBe("python");
        expect(normalizeSandboxLanguage("javascript")).toBe("javascript");
    });

    test("rejects unknown languages", () => {
        expect(normalizeSandboxLanguage("ruby")).toBeNull();
        expect(normalizeSandboxLanguage(42)).toBeNull();
    });
});

describe("validateSandboxCode", () => {
    test("requires non-empty code", () => {
        expect(validateSandboxCode("  ")).toContain("缺少");
        expect(validateSandboxCode(undefined)).toContain("缺少");
    });

    test("caps the source size", () => {
        expect(validateSandboxCode("x".repeat(MAX_CODE_CHARS + 1))).toContain(
            "太长",
        );
        expect(validateSandboxCode("print(1)")).toBeNull();
    });
});

const PNG = Buffer.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x01, 0x02, 0x03,
]).toString("base64");

describe("normalizeArtifactMime", () => {
    test("accepts the raster types the app renders", () => {
        expect(normalizeArtifactMime("image/png")).toBe("image/png");
        expect(normalizeArtifactMime("image/jpeg")).toBe("image/jpeg");
        expect(normalizeArtifactMime("image/webp")).toBe("image/webp");
        expect(normalizeArtifactMime("image/gif")).toBe("image/gif");
    });

    test("rejects everything else, including SVG", () => {
        expect(normalizeArtifactMime("image/svg+xml")).toBeNull();
        expect(normalizeArtifactMime("text/html")).toBeNull();
        expect(normalizeArtifactMime(42)).toBeNull();
    });
});

describe("sanitizeArtifacts", () => {
    test("keeps a valid artifact and derives its size from the base64", () => {
        const artifacts = sanitizeArtifacts([
            {
                path: "out/chart.png",
                mime: "image/png",
                // A lying `bytes` field must not be trusted.
                bytes: 1,
                data: PNG,
            },
        ]);
        expect(artifacts).toHaveLength(1);
        expect(artifacts[0]).toMatchObject({
            path: "out/chart.png",
            mime: "image/png",
            bytes: 11,
            data: PNG,
        });
    });

    test("drops traversal paths, unknown types, junk and duplicates", () => {
        const artifacts = sanitizeArtifacts([
            { path: "../secret.png", mime: "image/png", data: PNG },
            { path: "a.svg", mime: "image/svg+xml", data: PNG },
            { path: "a.png", mime: "image/png", data: "not base64!" },
            { path: "a.png", mime: "image/png", data: PNG },
            { path: "a.png", mime: "image/png", data: PNG },
            null,
            "x",
        ]);
        expect(artifacts.map((artifact) => artifact.path)).toEqual(["a.png"]);
    });

    test("rejects an image above the per-file cap", () => {
        const tooBig = "A".repeat(2_100_000); // 1.575 MB decoded
        expect((tooBig.length / 4) * 3).toBeGreaterThan(MAX_ARTIFACT_BYTES);
        expect(
            sanitizeArtifacts([
                { path: "huge.png", mime: "image/png", data: tooBig },
            ]),
        ).toEqual([]);
    });
});
