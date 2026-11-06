import { describe, expect, test } from "bun:test";

import { getBrowserLocation, reverseGeocode } from "./location";

function response(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), {
        status,
        headers: { "content-type": "application/json" },
    });
}

describe("reverseGeocode", () => {
    test("maps BigDataCloud's fields", async () => {
        const fetchImpl = (async () =>
            response({
                city: "上海市",
                locality: "浦东",
                principalSubdivision: "上海",
                countryName: "中国",
            })) as unknown as typeof fetch;
        await expect(reverseGeocode(31.23, 121.47, fetchImpl)).resolves.toEqual(
            {
                city: "上海市",
                region: "上海",
                country: "中国",
            },
        );
    });

    test("falls back to locality when city is empty", async () => {
        const fetchImpl = (async () =>
            response({
                city: "",
                locality: "浦东",
            })) as unknown as typeof fetch;
        await expect(reverseGeocode(31.23, 121.47, fetchImpl)).resolves.toEqual(
            {
                city: "浦东",
            },
        );
    });

    test("a failed lookup is not fatal", async () => {
        const failing = (async () =>
            response({}, 500)) as unknown as typeof fetch;
        await expect(reverseGeocode(31.23, 121.47, failing)).resolves.toEqual(
            {},
        );
        const throwing = (async () => {
            throw new Error("offline");
        }) as unknown as typeof fetch;
        await expect(reverseGeocode(31.23, 121.47, throwing)).resolves.toEqual(
            {},
        );
    });
});

describe("getBrowserLocation", () => {
    test("rejects when the browser has no geolocation API", async () => {
        const original = navigator.geolocation;
        Object.defineProperty(navigator, "geolocation", {
            configurable: true,
            value: undefined,
        });
        try {
            await expect(getBrowserLocation()).rejects.toThrow("不支持");
        } finally {
            Object.defineProperty(navigator, "geolocation", {
                configurable: true,
                value: original,
            });
        }
    });
});
