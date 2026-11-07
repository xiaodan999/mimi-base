import { describe, expect, test } from "bun:test";

import { AI_GEO_IP_PATH, createAiRelay, type AiRelayDeps } from "./ai-relay";
import { createIpCityLookup, isPrivateIp, resolveClientIp } from "./geo-ip";

const PB_BASE = "http://127.0.0.1:8090";

describe("resolveClientIp", () => {
    const req = (forwarded?: string) =>
        new Request("http://relay.test/ai/geo/ip", {
            headers: forwarded ? { "X-Forwarded-For": forwarded } : {},
        });

    test("prefers the rightmost proxy entry", () => {
        expect(resolveClientIp(req("203.0.113.7, 198.51.100.9"), "")).toBe(
            "198.51.100.9",
        );
    });

    test("falls back to the socket peer without the header", () => {
        expect(resolveClientIp(req(), "127.0.0.1")).toBe("127.0.0.1");
        expect(resolveClientIp(req("  "), "192.168.1.8")).toBe("192.168.1.8");
    });
});

describe("isPrivateIp", () => {
    test("knows the unresolvable ranges", () => {
        for (const ip of [
            "127.0.0.1",
            "10.1.2.3",
            "172.16.0.9",
            "192.168.1.8",
            "169.254.10.10",
            "0.1.2.3",
            "::1",
            "::",
            "fe80::1",
            "fd12:3456::1",
            "::ffff:192.168.1.8",
            "not-an-ip",
            "",
        ]) {
            expect(isPrivateIp(ip)).toBe(true);
        }
    });

    test("keeps public addresses, including global IPv6", () => {
        for (const ip of [
            "1.2.3.4",
            "8.8.8.8",
            "203.0.113.7",
            "114.114.114.114",
            "2409:8a55:4c::1",
            "::ffff:8.8.8.8",
        ]) {
            expect(isPrivateIp(ip)).toBe(false);
        }
    });
});

describe("createIpCityLookup", () => {
    // The package loads its bundled v4 database; assertions stick to
    // well-known ranges whose registrations do not drift with data updates.
    test("resolves public IPv4 addresses offline", async () => {
        const lookup = createIpCityLookup({ families: [4] });
        expect(await lookup("223.5.5.5")).toEqual({
            country: "中国",
            region: "浙江省",
            city: "杭州市",
        });
        expect((await lookup("114.114.114.114"))?.country).toBe("中国");
    });

    test("private IPs resolve only through the dev egress fallback", async () => {
        const noFallback = createIpCityLookup({ families: [4] });
        expect(await noFallback("127.0.0.1")).toBeNull();
        expect(await noFallback("192.168.1.8")).toBeNull();

        let egressCalls = 0;
        const fetchImpl = (async (input: RequestInfo | URL) => {
            if (String(input) === "https://api.ipify.org") {
                egressCalls += 1;
                return new Response("223.5.5.5");
            }
            throw new Error("unexpected fetch");
        }) as typeof fetch;
        const withFallback = createIpCityLookup({
            fetch: fetchImpl,
            families: [4],
            devEgress: true,
        });
        expect((await withFallback("192.168.1.8"))?.city).toBe("杭州市");
        expect((await withFallback("10.0.0.5"))?.city).toBe("杭州市");
        expect(egressCalls).toBe(1); // cached
    });

    test("a dead egress lookup stays null", async () => {
        const fetchImpl = (async () => {
            throw new Error("offline");
        }) as unknown as typeof fetch;
        const lookup = createIpCityLookup({
            fetch: fetchImpl,
            families: [4],
            devEgress: true,
        });
        expect(await lookup("192.168.1.8")).toBeNull();
    });
});

describe("geo endpoint", () => {
    const PATH = AI_GEO_IP_PATH;

    function harness(overrides: Partial<AiRelayDeps> = {}) {
        const authHeader = (init?: RequestInit): string => {
            const headers = init?.headers;
            if (headers instanceof Headers) {
                return headers.get("authorization") ?? "";
            }
            const record = (headers as Record<string, string>) ?? {};
            return record.Authorization ?? record.authorization ?? "";
        };
        const fetchImpl = (async (
            input: RequestInfo | URL,
            init?: RequestInit,
        ) => {
            const url = String(input);
            if (url === `${PB_BASE}/api/collections/users/auth-refresh`) {
                return authHeader(init) === "good-token"
                    ? new Response(JSON.stringify({ record: { id: "user-1" } }))
                    : new Response("invalid", { status: 401 });
            }
            return new Response("{}");
        }) as typeof fetch;
        const relay = createAiRelay({
            pbBaseUrl: PB_BASE,
            apiKey: "server-key",
            model: "deepseek-v4.1-flash",
            dailyLimit: 0,
            fetch: fetchImpl,
            ...overrides,
        });
        return relay;
    }

    test("requires auth", async () => {
        const relay = harness({ geoLookup: async () => null });
        const res = await relay(
            new Request(`http://relay.test${PATH}`, { method: "GET" }),
        );
        expect(res?.status).toBe(401);
    });

    test("answers with the resolved city for the rightmost XFF entry", async () => {
        const seen: string[] = [];
        const relay = harness({
            geoLookup: async (ip) => {
                seen.push(ip);
                return { country: "中国", region: "浙江省", city: "杭州市" };
            },
        });
        const res = await relay(
            new Request(`http://relay.test${PATH}`, {
                method: "GET",
                headers: {
                    Authorization: "good-token",
                    "X-Forwarded-For": "203.0.113.7, 198.51.100.9",
                },
            }),
            "127.0.0.1",
        );
        expect(res?.status).toBe(200);
        expect(await res?.json()).toEqual({
            city: "杭州市",
            region: "浙江省",
            country: "中国",
        });
        expect(seen).toEqual(["198.51.100.9"]);
    });

    test("unknown IPs answer with empty fields, not an error", async () => {
        const relay = harness({ geoLookup: async () => null });
        const res = await relay(
            new Request(`http://relay.test${PATH}`, {
                method: "GET",
                headers: { Authorization: "good-token" },
            }),
            "127.0.0.1",
        );
        expect(res?.status).toBe(200);
        expect(await res?.json()).toEqual({
            city: "",
            region: "",
            country: "",
        });
    });

    test("shares the data tools' minute budget", async () => {
        const relay = harness({ geoLookup: async () => null });
        const req = () =>
            new Request(`http://relay.test${PATH}`, {
                method: "GET",
                headers: { Authorization: "good-token" },
            });
        let last: Response | null = await relay(req());
        for (let i = 0; i < 30 && last?.status === 200; i += 1) {
            last = await relay(req());
        }
        expect(last?.status).toBe(429);
    });
});
