/// <reference lib="webworker" />
/**
 * pdf.js worker. Owns the untrusted parse/render work so the API can kill it
 * with `worker.terminate()`; nothing here touches the network or the API key.
 */

import { FileReadError, type PdfJob, runPdfJob } from "./ai-files";

declare var self: Worker;

self.onmessage = async (event: MessageEvent<PdfJob>) => {
    try {
        const result = await runPdfJob(event.data);
        self.postMessage({ ok: true, result });
    } catch (error) {
        const fileError =
            error instanceof FileReadError
                ? error
                : new FileReadError("PDF 解析失败", 500);
        self.postMessage({
            ok: false,
            error: {
                message: fileError.message,
                status: fileError.status,
                ...(fileError.code ? { code: fileError.code } : {}),
            },
        });
    }
};
