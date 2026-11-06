import { describe, expect, test } from "bun:test";

import {
    MAX_CODE_CHARS,
    MAX_FILE_CHARS,
    normalizeSandboxPath,
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
