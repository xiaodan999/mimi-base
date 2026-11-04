import { describe, expect, test } from "bun:test";

import {
    isSameSelection,
    ringPayload,
    selectionFromUser,
} from "./ring-selection";

describe("selectionFromUser", () => {
    test("no settings falls back to the default ring", () => {
        expect(selectionFromUser({})).toEqual({ kind: "default" });
        expect(selectionFromUser(null)).toEqual({ kind: "default" });
    });

    test("uploaded ring wins over a preset", () => {
        expect(
            selectionFromUser({ circle: "ring-1", circle_preset: "neon" }),
        ).toEqual({ kind: "custom", id: "ring-1" });
    });

    test("none is preserved", () => {
        expect(selectionFromUser({ circle_preset: "none" })).toEqual({
            kind: "none",
        });
    });

    test("known preset is preserved", () => {
        expect(selectionFromUser({ circle_preset: "orbit" })).toEqual({
            kind: "preset",
            key: "orbit",
        });
    });

    test("unknown preset keys fall back to the default", () => {
        expect(selectionFromUser({ circle_preset: "gone" })).toEqual({
            kind: "default",
        });
    });
});

describe("ringPayload", () => {
    test("default clears both fields", () => {
        expect(ringPayload({ kind: "default" })).toEqual({
            circle: "",
            circle_preset: "",
        });
    });

    test("preset clears the relation", () => {
        expect(ringPayload({ kind: "preset", key: "gold" })).toEqual({
            circle: "",
            circle_preset: "gold",
        });
    });

    test("custom clears the preset", () => {
        expect(ringPayload({ kind: "custom", id: "r1" })).toEqual({
            circle: "r1",
            circle_preset: "",
        });
    });

    test("none keeps the sentinel", () => {
        expect(ringPayload({ kind: "none" })).toEqual({
            circle: "",
            circle_preset: "none",
        });
    });
});

describe("isSameSelection", () => {
    test("matches presets by key", () => {
        expect(
            isSameSelection(
                { kind: "preset", key: "gold" },
                { kind: "preset", key: "gold" },
            ),
        ).toBe(true);
        expect(
            isSameSelection(
                { kind: "preset", key: "gold" },
                { kind: "preset", key: "neon" },
            ),
        ).toBe(false);
    });

    test("matches custom rings by id", () => {
        expect(
            isSameSelection(
                { kind: "custom", id: "r1" },
                { kind: "custom", id: "r1" },
            ),
        ).toBe(true);
        expect(
            isSameSelection(
                { kind: "custom", id: "r1" },
                { kind: "custom", id: "r2" },
            ),
        ).toBe(false);
    });

    test("different kinds never match", () => {
        expect(isSameSelection({ kind: "none" }, { kind: "default" })).toBe(
            false,
        );
    });
});
