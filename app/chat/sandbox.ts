import {
    sanitizeFiles,
    type SandboxRequest,
    type SandboxResponse,
} from "./sandbox-protocol";

export const SANDBOX_TIMEOUT_MS = 15_000;

let nextRequestId = 1;

type SandboxInput = Omit<SandboxRequest, "id">;

/**
 * Run one sandbox operation in a fresh worker.
 *
 * A new worker per call means no state leaks between calls except the file
 * snapshot we pass in explicitly, and `terminate()` is a reliable timeout for
 * synchronous infinite loops.
 */
export function runSandbox(
    input: SandboxInput,
    timeoutMs = SANDBOX_TIMEOUT_MS,
): Promise<SandboxResponse> {
    const id = nextRequestId++;
    const files = sanitizeFiles(input.files);

    if (typeof Worker === "undefined") {
        return Promise.resolve({
            id,
            ok: false,
            error: "当前浏览器不支持沙箱",
            logs: [],
            files,
            durationMs: 0,
        });
    }

    return new Promise((resolve) => {
        let settled = false;
        let timer: ReturnType<typeof setTimeout> | null = null;
        const worker = new Worker(
            new URL("./sandbox.worker.ts", import.meta.url),
            {
                type: "module",
                name: "mimi-chat-sandbox",
            },
        );

        const finish = (response: SandboxResponse) => {
            if (settled) return;
            settled = true;
            if (timer !== null) clearTimeout(timer);
            worker.terminate();
            resolve(response);
        };

        timer = setTimeout(() => {
            finish({
                id,
                ok: false,
                error: `沙箱执行超时（${Math.round(timeoutMs / 1000)} 秒）`,
                logs: [],
                files,
                durationMs: timeoutMs,
            });
        }, timeoutMs);

        worker.onmessage = (event: MessageEvent<SandboxResponse>) => {
            if (event.data?.id === id) finish(event.data);
        };
        worker.onerror = (event) => {
            finish({
                id,
                ok: false,
                error: event.message || "沙箱运行出错",
                logs: [],
                files,
                durationMs: 0,
            });
        };

        worker.postMessage({ ...input, files, id });
    });
}
