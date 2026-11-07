import { describe, expect, test } from "bun:test";

/**
 * The sandbox file snapshot lives in the runners (one JSON request on stdin,
 * one JSON response on stdout). `sandbox_write`'s append mode is what lets a
 * long file be written across several model rounds when a single response
 * hits the output cap, so it is pinned here for both languages.
 */

const NODE = process.execPath; // bun can run the mjs runner directly
const PYTHON = "python3";

async function runRunner(
    runner: "pocketbase/sandbox/runner.mjs" | "pocketbase/sandbox/runner.py",
    bin: string,
    request: Record<string, unknown>,
): Promise<{
    ok: boolean;
    result?: { path: string; size: number } | unknown;
    files: Record<string, string>;
    error?: string;
}> {
    const child = Bun.spawn([bin, runner], {
        stdin: "pipe",
        stdout: "pipe",
        stderr: "pipe",
    });
    child.stdin.write(JSON.stringify(request));
    child.stdin.end();
    const stdout = await new Response(child.stdout).text();
    await child.exited;
    return JSON.parse(stdout);
}

const firstWrite = {
    op: "write",
    path: "manual.html",
    content: "<html><body><h1>标题</h1>",
    files: {},
};

describe("runner write append (mjs)", () => {
    test("creates, then extends the same file", async () => {
        const first = await runRunner(
            "pocketbase/sandbox/runner.mjs",
            NODE,
            firstWrite,
        );
        expect(first.ok).toBe(true);
        expect(first.result).toEqual({ path: "manual.html", size: 23 });
        expect(first.files["manual.html"]).toBe("<html><body><h1>标题</h1>");

        const second = await runRunner("pocketbase/sandbox/runner.mjs", NODE, {
            op: "write",
            path: "manual.html",
            content: "<p>第二段</p></body></html>",
            append: true,
            files: first.files,
        });
        expect(second.ok).toBe(true);
        expect(second.result).toEqual({ path: "manual.html", size: 47 });
        expect(second.files["manual.html"]).toBe(
            "<html><body><h1>标题</h1><p>第二段</p></body></html>",
        );
    });

    test("append without an existing file behaves as a plain write", async () => {
        const res = await runRunner("pocketbase/sandbox/runner.mjs", NODE, {
            op: "write",
            path: "new.txt",
            content: "hello",
            append: true,
            files: {},
        });
        expect(res.ok).toBe(true);
        expect(res.files["new.txt"]).toBe("hello");
    });

    test("the merged file still respects the per-file cap", async () => {
        const res = await runRunner("pocketbase/sandbox/runner.mjs", NODE, {
            op: "write",
            path: "big.txt",
            content: "a".repeat(50_000),
            append: true,
            files: { "big.txt": "b".repeat(60_000) },
        });
        expect(res.ok).toBe(false);
        expect(res.error).toContain("最多");
    });

    test("append=false still overwrites", async () => {
        const res = await runRunner("pocketbase/sandbox/runner.mjs", NODE, {
            op: "write",
            path: "manual.html",
            content: "replaced",
            files: { "manual.html": "<html>old" },
        });
        expect(res.ok).toBe(true);
        expect(res.files["manual.html"]).toBe("replaced");
    });
});

describe("runner write append (python)", () => {
    test("creates, then extends the same file", async () => {
        const first = await runRunner(
            "pocketbase/sandbox/runner.py",
            PYTHON,
            firstWrite,
        );
        expect(first.ok).toBe(true);
        expect(first.files["manual.html"]).toBe("<html><body><h1>标题</h1>");

        const second = await runRunner("pocketbase/sandbox/runner.py", PYTHON, {
            op: "write",
            path: "manual.html",
            content: "<p>第二段</p></body></html>",
            append: true,
            files: first.files,
        });
        expect(second.ok).toBe(true);
        expect(second.files["manual.html"]).toBe(
            "<html><body><h1>标题</h1><p>第二段</p></body></html>",
        );
    });

    test("append without an existing file behaves as a plain write", async () => {
        const res = await runRunner("pocketbase/sandbox/runner.py", PYTHON, {
            op: "write",
            path: "new.txt",
            content: "hello",
            append: true,
            files: {},
        });
        expect(res.ok).toBe(true);
        expect(res.files["new.txt"]).toBe("hello");
    });
});
