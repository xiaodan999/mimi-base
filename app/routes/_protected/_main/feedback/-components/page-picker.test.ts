import { describe, expect, test } from "bun:test";

import { FEEDBACK_PAGES, feedbackPageOptions } from "./page-picker";

const MAIN_PATHS = [
    "/home",
    "/chat",
    "/jizhang",
    "/study",
    "/profile",
    "/report",
    "/about",
    "/feedback",
];

describe("feedbackPageOptions", () => {
    test("offers every main page in a stable order", () => {
        expect(FEEDBACK_PAGES.map((page) => page.path)).toEqual(MAIN_PATHS);
        expect(FEEDBACK_PAGES.every((page) => page.label.length > 0)).toBe(
            true,
        );
    });

    test("keeps a remembered deep link as the first 最近访问 choice", () => {
        const options = feedbackPageOptions("/chat/abc123");
        expect(options[0]).toEqual({ path: "/chat/abc123", label: "最近访问" });
        expect(options.slice(1)).toEqual([...FEEDBACK_PAGES]);
    });

    test("does not duplicate a remembered main page", () => {
        expect(feedbackPageOptions("/study")).toEqual([...FEEDBACK_PAGES]);
    });

    test("falls back to the main pages for an empty route", () => {
        expect(feedbackPageOptions("   ")).toEqual([...FEEDBACK_PAGES]);
    });
});
