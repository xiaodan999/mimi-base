import { describe, expect, test } from "bun:test";

import { createSandboxService } from "./sandbox";

const service = createSandboxService();
await service.ensure();

function run(code: string, files: Record<string, string> = {}) {
    return service.run({ op: "run", code, files });
}

describe("quickjs sandbox", () => {
    test("returns a value and logs", async () => {
        const response = await run(
            `console.log("hi", 1 + 1); return { ok: true, n: 42 };`,
        );
        expect(response.ok).toBe(true);
        expect(response.logs).toContain("hi 2");
        expect(response.result).toEqual({ ok: true, n: 42 });
    });

    test("reads and writes conversation files", async () => {
        const response = await run(
            `
            console.log(sandbox.read("notes.md"));
            sandbox.write("out.txt", "hello");
            sandbox.write("out.txt", sandbox.read("out.txt") + "!");
            return sandbox.list();
            `,
            { "notes.md": "hello" },
        );
        expect(response.ok).toBe(true);
        expect(response.logs).toContain("hello");
        expect(response.files["out.txt"]).toBe("hello!");
        expect(response.result).toEqual(["notes.md", "out.txt"]);
    });

    test("supports the result global", async () => {
        const response = await run(`result = 7;`);
        expect(response.ok).toBe(true);
        expect(response.result).toBe(7);
    });

    test("reports thrown and syntax errors", async () => {
        const thrown = await run(`throw new Error("boom")`);
        expect(thrown.ok).toBe(false);
        expect(thrown.error).toContain("boom");

        const syntax = await run(`function (`);
        expect(syntax.ok).toBe(false);
        expect(syntax.error).toBeTruthy();
    });

    test("exposes no host globals", async () => {
        const response = await run(
            `return [typeof fetch, typeof process, typeof require, typeof XMLHttpRequest];`,
        );
        expect(response.result).toEqual([
            "undefined",
            "undefined",
            "undefined",
            "undefined",
        ]);
    });

    test("rejects private fetch targets", async () => {
        const response = await run(
            `return await sandbox.fetch("http://127.0.0.1:9/")`,
        );
        expect(response.ok).toBe(false);
        expect(response.error).toContain("内网");
    });

    test("enforces the memory limit", async () => {
        const response = await run(`return new Array(1e8).fill(0).length`);
        expect(response.ok).toBe(false);
        expect(response.error).toBeTruthy();
    });

    test("times out a hot loop", async () => {
        const fast = createSandboxService({ timeoutMs: 300 });
        await fast.ensure();
        const response = await fast.run({
            op: "run",
            code: "while (true) {}",
            files: {},
        });
        expect(response.ok).toBe(false);
        expect(response.error).toContain("超时");
    }, 15_000);

    test("read/write/list do not spawn a runtime", async () => {
        const read = await service.run({
            op: "read",
            path: "a.txt",
            files: { "a.txt": "x" },
        });
        expect(read.result).toBe("x");

        const write = await service.run({
            op: "write",
            path: "b.txt",
            content: "y",
            files: {},
        });
        expect(write.files).toEqual({ "b.txt": "y" });

        const list = await service.run({
            op: "list",
            files: { "b.txt": "y", "a.txt": "x" },
        });
        expect(list.result).toEqual(["a.txt", "b.txt"]);
    });
});
