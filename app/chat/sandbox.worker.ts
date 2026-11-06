/**
 * Dedicated worker that runs model-authored sandbox code.
 *
 * Everything here is intentionally minimal: no DOM, no storage, no network.
 * The hard timeout lives on the main thread (`worker.terminate()`), so an
 * infinite loop cannot hang the page.
 */
import {
    runSandboxOperation,
    type SandboxRequest,
    type SandboxResponse,
} from "./sandbox-protocol";

type WorkerScope = {
    onmessage: ((event: MessageEvent<SandboxRequest>) => void) | null;
    postMessage: (message: SandboxResponse) => void;
};

const scope = self as unknown as WorkerScope;

function blocked(): never {
    throw new Error("沙箱内不能访问网络或页面存储");
}

/** Replace every network/storage entry point before user code can run. */
for (const key of [
    "fetch",
    "XMLHttpRequest",
    "WebSocket",
    "EventSource",
    "importScripts",
    "indexedDB",
    "caches",
    "openDatabase",
]) {
    try {
        Object.defineProperty(self, key, {
            value: blocked,
            configurable: true,
            writable: false,
        });
    } catch {
        // Some globals are non-configurable in a given browser; the rest
        // still apply.
    }
}

try {
    Object.defineProperty(self.navigator, "sendBeacon", {
        value: blocked,
        configurable: true,
        writable: false,
    });
} catch {
    // ignore
}

scope.onmessage = async (event: MessageEvent<SandboxRequest>) => {
    const request = event.data;
    const response = await runSandboxOperation(request);
    scope.postMessage(response);
};
