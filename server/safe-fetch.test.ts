import { describe, expect, test } from "bun:test";

import {
    isPrivateIp,
    pinnedFetch,
    resolvePublicHost,
    UrlPolicyError,
} from "./safe-fetch";

describe("resolvePublicHost", () => {
    test("keeps public IP literals", async () => {
        expect(await resolvePublicHost("1.1.1.1")).toEqual({
            address: "1.1.1.1",
            family: 4,
        });
        // Bracketed IPv6 literals used to fail as a DNS lookup of "[::1]".
        await expect(resolvePublicHost("[::1]")).rejects.toBeInstanceOf(
            UrlPolicyError,
        );
        await expect(
            resolvePublicHost("[2606:4700:4700::1111]"),
        ).resolves.toEqual({
            address: "2606:4700:4700::1111",
            family: 6,
        });
    });

    test("rejects private IPv4 and IPv6 ranges", async () => {
        for (const host of [
            "127.0.0.1",
            "10.0.0.1",
            "169.254.169.254",
            "[::1]",
            "[64:ff9b::7f00:1]",
            "[2002:7f00:1::]",
            "[fec0::1]",
            "[2001:db8::1]",
        ]) {
            await expect(resolvePublicHost(host)).rejects.toBeInstanceOf(
                UrlPolicyError,
            );
        }
    });
});

describe("isPrivateIp", () => {
    test("covers IPv4-mapped, NAT64, 6to4 and site-local", () => {
        expect(isPrivateIp("::ffff:127.0.0.1")).toBe(true);
        expect(isPrivateIp("::ffff:7f00:1")).toBe(true);
        expect(isPrivateIp("64:ff9b::7f00:1")).toBe(true);
        expect(isPrivateIp("2002:7f00:1::")).toBe(true);
        expect(isPrivateIp("fec0::1")).toBe(true);
        expect(isPrivateIp("2001:db8::1")).toBe(true);
        expect(isPrivateIp("2606:4700:4700::1111")).toBe(false);
    });
});

describe("pinnedFetch", () => {
    test("refuses a private target before opening a socket", async () => {
        await expect(pinnedFetch("http://127.0.0.1:9/")).rejects.toBeInstanceOf(
            UrlPolicyError,
        );
        await expect(pinnedFetch("http://[::1]:9/")).rejects.toBeInstanceOf(
            UrlPolicyError,
        );
    });

    test("refuses non-http schemes", async () => {
        await expect(pinnedFetch("file:///etc/passwd")).rejects.toBeInstanceOf(
            UrlPolicyError,
        );
    });
});
