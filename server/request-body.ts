/**
 * Request-body reader with a hard byte cap.
 *
 * `Content-Length` is only a hint: a chunked request has none, and a client
 * can lie. Reading through this helper enforces the cap while the stream is
 * consumed, so a route never buffers an unbounded body into memory.
 */

export class BodyTooLargeError extends Error {
    constructor(message = "请求体过大") {
        super(message);
        this.name = "BodyTooLargeError";
    }
}

export async function readRequestBody(
    req: Request,
    maxBytes: number,
): Promise<Uint8Array> {
    const header = req.headers.get("content-length");
    const declared = header === null ? Number.NaN : Number(header);
    if (Number.isFinite(declared) && declared > maxBytes) {
        throw new BodyTooLargeError();
    }

    const body = req.body;
    if (!body) return new Uint8Array();

    const reader = body.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    try {
        for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            if (!value || value.byteLength === 0) continue;
            if (total + value.byteLength > maxBytes) {
                throw new BodyTooLargeError();
            }
            chunks.push(value);
            total += value.byteLength;
        }
    } catch (error) {
        await reader.cancel().catch(() => {});
        throw error;
    }
    reader.releaseLock();

    const bytes = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
        bytes.set(chunk, offset);
        offset += chunk.byteLength;
    }
    return bytes;
}

export async function readTextBody(
    req: Request,
    maxBytes: number,
): Promise<string> {
    return new TextDecoder().decode(await readRequestBody(req, maxBytes));
}

export async function readJsonBody<T>(
    req: Request,
    maxBytes: number,
): Promise<T> {
    return JSON.parse(await readTextBody(req, maxBytes)) as T;
}

export async function readFormDataBody(
    req: Request,
    maxBytes: number,
): Promise<FormData> {
    const bytes = await readRequestBody(req, maxBytes);
    const type = req.headers.get("content-type") ?? "";
    return new Response(bytes.buffer as ArrayBuffer, {
        headers: type ? { "content-type": type } : undefined,
    }).formData();
}
