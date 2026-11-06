import { describe, expect, test } from "bun:test";

import {
    MAX_FILE_CHARS,
    normalizeSandboxPath,
    runSandboxOperation,
    safeSerialize,
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

    test("blocks external script loading", () => {
        expect(validateSandboxCode('await import("https://x")')).toContain(
            "外部脚本",
        );
        expect(validateSandboxCode("importScripts('x.js')")).toContain(
            "外部脚本",
        );
    });
});

describe("runSandboxOperation", () => {
    test("runs code, captures logs, and returns the value", async () => {
        const response = await runSandboxOperation({
            id: 1,
            op: "run",
            files: {},
            code: `
                sandbox.write("a.txt", "hello");
                console.log("wrote", sandbox.list().join(","));
                return sandbox.read("a.txt");
            `,
        });
        expect(response.ok).toBe(true);
        expect(response.result).toBe("hello");
        expect(response.logs).toEqual(["wrote a.txt"]);
        expect(response.files["a.txt"]).toBe("hello");
    });

    test("async code is awaited", async () => {
        const response = await runSandboxOperation({
            id: 2,
            op: "run",
            files: { "n.txt": "4" },
            code: `
                await new Promise((resolve) => setTimeout(resolve, 1));
                return Number(sandbox.read("n.txt")) * 2;
            `,
        });
        expect(response.result).toBe(8);
    });

    test("thrown errors mark the run as failed", async () => {
        const response = await runSandboxOperation({
            id: 3,
            op: "run",
            files: {},
            code: 'throw new Error("boom")',
        });
        expect(response.ok).toBe(false);
        expect(response.error).toBe("boom");
    });

    test("files written before an error are kept", async () => {
        const response = await runSandboxOperation({
            id: 4,
            op: "run",
            files: {},
            code: 'sandbox.write("x.txt", "kept"); throw new Error("stop")',
        });
        expect(response.ok).toBe(false);
        expect(response.files["x.txt"]).toBe("kept");
    });

    test("read / write / list are separate ops", async () => {
        const write = await runSandboxOperation({
            id: 5,
            op: "write",
            path: "a.txt",
            content: "1",
            files: {},
        });
        expect(write.ok).toBe(true);
        expect(write.files["a.txt"]).toBe("1");

        const list = await runSandboxOperation({
            id: 6,
            op: "list",
            files: write.files,
        });
        expect(list.result).toEqual(["a.txt"]);

        const read = await runSandboxOperation({
            id: 7,
            op: "read",
            path: "missing.txt",
            files: write.files,
        });
        expect(read.ok).toBe(true);
        expect(read.result).toBeNull();
    });

    test("write enforces the size cap", async () => {
        const response = await runSandboxOperation({
            id: 8,
            op: "write",
            path: "big.txt",
            content: "x".repeat(MAX_FILE_CHARS + 1),
            files: {},
        });
        expect(response.ok).toBe(false);
    });
});

describe("safeSerialize", () => {
    test("handles circular structures", () => {
        const value: Record<string, unknown> = { a: 1 };
        value.self = value;
        expect(() => safeSerialize(value)).not.toThrow();
    });

    test("normalizes undefined and BigInt", () => {
        expect(safeSerialize(undefined)).toBeNull();
        expect(safeSerialize(1n)).toBe("1n");
    });
});
