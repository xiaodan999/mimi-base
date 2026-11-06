import { describe, expect, test } from "bun:test";

import { isUpdateUnseen } from "./seen";

describe("isUpdateUnseen", () => {
    test("shows the dot when nothing was opened yet", () => {
        expect(isUpdateUnseen("2026-11-06", null)).toBe(true);
    });

    test("hides the dot after the newest update is opened", () => {
        expect(isUpdateUnseen("2026-11-06", "2026-11-06")).toBe(false);
    });

    test("shows the dot again when a newer update ships", () => {
        expect(isUpdateUnseen("2026-11-20", "2026-11-06")).toBe(true);
    });

    test("stays quiet when there are no updates", () => {
        expect(isUpdateUnseen(undefined, null)).toBe(false);
    });
});
