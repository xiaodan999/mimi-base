import { describe, expect, test } from "bun:test";

import { toInternalHref } from "./redirect";

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
