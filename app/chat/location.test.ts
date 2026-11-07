import { describe, expect, test } from "bun:test";

import { getIpCity } from "./location";

const request = {
    url: "http://relay.test/ai/geo/ip",
    headers: { Authorization: "token" },
};

function response(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), {
        status,
        headers: { "content-type": "application/json" },
    });
}

/** Bun's transpiler dislikes a multi-line arrow followed by `as`; wrap it. */
function asFetch(fn: () => Promise<Response>): typeof fetch {
    return fn as unknown as typeof fetch;
}

describe("getIpCity", () => {
    test("maps the relay payload", async () => {
        const fetchImpl = asFetch(async () =>
            response({ city: "杭州市", region: "浙江省", country: "中国" }),
        );
        await expect(getIpCity(request, fetchImpl)).resolves.toEqual({
            city: "杭州市",
            region: "浙江省",
            country: "中国",
        });
    });

    test("omits empty region/country", async () => {
        const fetchImpl = asFetch(async () =>
            response({ city: "杭州市", region: "", country: "" }),
        );
        await expect(getIpCity(request, fetchImpl)).resolves.toEqual({
            city: "杭州市",
        });
    });

    test("rejects when the server cannot resolve a city", async () => {
        const fetchImpl = asFetch(async () => response({ city: "" }));
        await expect(getIpCity(request, fetchImpl)).rejects.toThrow("识别");
    });

    test("rejects on relay errors and network failures", async () => {
        const failing = asFetch(async () => response({}, 401));
        await expect(getIpCity(request, failing)).rejects.toThrow("识别");
        const throwing = asFetch(async () => {
            throw new Error("offline");
        });
        await expect(getIpCity(request, throwing)).rejects.toThrow("网络");
    });
});
