import { describe, expect, test } from "bun:test";

import {
    DEFAULT_LOGIN_TARGET,
    hrefWithoutDev,
    toInternalHref,
    toLoginTarget,
} from "./redirect";

const ORIGIN = "http://localhost:3000";

describe("toInternalHref", () => {
    test("keeps an in-app path, search and hash", () => {
        expect(toInternalHref("/jizhang?month=11", ORIGIN)).toBe(
            "/jizhang?month=11",
        );
        expect(toInternalHref("/chat/abc#msg-2", ORIGIN)).toBe(
            "/chat/abc#msg-2",
        );
        expect(toInternalHref("/", ORIGIN)).toBe("/");
    });

    test("rejects external, protocol-relative and relative targets", () => {
        expect(toInternalHref("https://evil.example", ORIGIN)).toBeNull();
        expect(toInternalHref("//evil.example", ORIGIN)).toBeNull();
        expect(toInternalHref("/\\evil.example", ORIGIN)).toBeNull();
        expect(toInternalHref("jizhang", ORIGIN)).toBeNull();
    });

    test("rejects missing values", () => {
        expect(toInternalHref("", ORIGIN)).toBeNull();
        expect(toInternalHref(null, ORIGIN)).toBeNull();
        expect(toInternalHref(undefined, ORIGIN)).toBeNull();
    });
});

describe("hrefWithoutDev", () => {
    test("drops the dev key and keeps the rest of the location", () => {
        expect(
            hrefWithoutDev({
                pathname: "/jizhang",
                searchStr: "?month=11&dev=test",
                hash: "",
            }),
        ).toBe("/jizhang?month=11");
        expect(
            hrefWithoutDev({
                pathname: "/home",
                searchStr: "?dev=test2",
                hash: "",
            }),
        ).toBe("/home");
        expect(
            hrefWithoutDev({
                pathname: "/chat/abc",
                searchStr: "",
                hash: "msg-2",
            }),
        ).toBe("/chat/abc#msg-2");
    });

    test("never leaves a redirect that would sign in again", () => {
        expect(
            toLoginTarget(
                hrefWithoutDev({
                    pathname: "/home",
                    searchStr: "?dev=test",
                    hash: "",
                }),
                ORIGIN,
            ),
        ).toBe("/home");
    });
});

describe("toLoginTarget", () => {
    test("keeps a real destination", () => {
        expect(toLoginTarget("/jizhang?month=11", ORIGIN)).toBe(
            "/jizhang?month=11",
        );
        expect(toLoginTarget("/chat/abc#msg-2", ORIGIN)).toBe(
            "/chat/abc#msg-2",
        );
    });

    test("never returns the login page itself", () => {
        expect(toLoginTarget("/login", ORIGIN)).toBe(DEFAULT_LOGIN_TARGET);
        expect(toLoginTarget("/login?redirect=%2Fhome", ORIGIN)).toBe(
            DEFAULT_LOGIN_TARGET,
        );
        expect(toLoginTarget("/login/", ORIGIN)).toBe(DEFAULT_LOGIN_TARGET);
    });

    test("falls back for external or missing targets", () => {
        expect(toLoginTarget("https://evil.example", ORIGIN)).toBe(
            DEFAULT_LOGIN_TARGET,
        );
        expect(toLoginTarget(undefined, ORIGIN)).toBe(DEFAULT_LOGIN_TARGET);
    });
});
