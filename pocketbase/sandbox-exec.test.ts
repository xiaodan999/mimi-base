import { describe, expect, test } from "bun:test";

import { buildDockerRunArgs, createSandboxExecutor } from "./sandbox-exec";

describe("Docker sandbox flags", () => {
    const args = buildDockerRunArgs("mimi-sandbox-test", "mimi-sandbox:abc");

    test("uses the dedicated network and an unprivileged container", () => {
        expect(args).toContain("--network");
        expect(args[args.indexOf("--network") + 1]).toBe("mimi-sandbox");
        expect(args).toContain("--read-only");
        expect(args).toContain("--cap-drop");
        expect(args[args.indexOf("--cap-drop") + 1]).toBe("ALL");
        expect(args).toContain("--security-opt");
        expect(args[args.indexOf("--security-opt") + 1]).toBe(
            "no-new-privileges:true",
        );
        expect(args[args.indexOf("--user") + 1]).toBe("65534:65534");
    });

    test("limits time-adjacent resources", () => {
        expect(args[args.indexOf("--pids-limit") + 1]).toBe("64");
        expect(args[args.indexOf("--memory") + 1]).toBe("256m");
        expect(args[args.indexOf("--cpus") + 1]).toBe("0.5");
        expect(args).toContain("--ipc");
        expect(args[args.indexOf("--ipc") + 1]).toBe("none");
    });

    test("has no host mounts, privileged mode or Docker socket", () => {
        expect(args).not.toContain("--privileged");
        expect(args.join(" ")).not.toContain("docker.sock");
        expect(args.join(" ")).not.toContain("/root");
        expect(args.at(-1)).toBe("mimi-sandbox:abc");
    });
});

const hasPython = Boolean(Bun.which("python3"));
const executor = createSandboxExecutor({
    prod: false,
    dir: import.meta.dir,
});

describe.skipIf(!hasPython)("dev Python executor", () => {
    test("runs code, captures logs and returns files", async () => {
        await executor.ensure();
        expect(executor.available()).toBe(true);
        const response = await executor.run({
            op: "run",
            code: `
sandbox.write("notes/a.txt", "hi")
print("logged")
result = sandbox.read("notes/a.txt")
`,
        });
        expect(response.ok).toBe(true);
        expect(response.result).toBe("hi");
        expect(response.logs).toEqual(["logged"]);
        expect(response.files["notes/a.txt"]).toBe("hi");
    });

    test("supports read/write/list operations", async () => {
        const write = await executor.run({
            op: "write",
            path: "x.txt",
            content: "1",
        });
        expect(write.ok).toBe(true);
        expect(write.files["x.txt"]).toBe("1");

        const list = await executor.run({
            op: "list",
            files: write.files,
        });
        expect(list.result).toEqual(["x.txt"]);

        const read = await executor.run({
            op: "read",
            path: "missing.txt",
            files: write.files,
        });
        expect(read.result).toBeNull();
    });

    test("path traversal is rejected", async () => {
        const response = await executor.run({
            op: "run",
            code: `result = sandbox.read("../secret")`,
        });
        expect(response.ok).toBe(false);
        expect(response.error).toContain("路径");
    });

    test("a thrown error is reported without crashing the runner", async () => {
        const response = await executor.run({
            op: "run",
            code: `raise RuntimeError("boom")`,
        });
        expect(response.ok).toBe(false);
        expect(response.error).toContain("boom");
    });
});
