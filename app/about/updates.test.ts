import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, test } from "bun:test";

import { UPDATES } from "./updates";

const changelog = readFileSync(
    path.join(import.meta.dir, "../../CHANGELOG.md"),
    "utf8",
);

/** `2026-02-31` matches the pattern but is not a real calendar day. */
function isRealDate(value: string): boolean {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
    if (!match) return false;
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    const date = new Date(Date.UTC(year, month - 1, day));
    return (
        date.getUTCFullYear() === year &&
        date.getUTCMonth() === month - 1 &&
        date.getUTCDate() === day
    );
}

function bullets(entry: (typeof UPDATES)[number]): string[] {
    return [
        ...(entry.added ?? []),
        ...(entry.fixed ?? []),
        ...(entry.changed ?? []),
    ];
}

describe("UPDATES", () => {
    test("has at least one entry", () => {
        expect(UPDATES.length).toBeGreaterThan(0);
    });

    test("uses real YYYY-MM-DD dates", () => {
        for (const entry of UPDATES) {
            expect(isRealDate(entry.date)).toBe(true);
        }
    });

    test("is newest first with no duplicate dates", () => {
        // Strictly descending also rejects equal dates.
        for (let index = 1; index < UPDATES.length; index += 1) {
            expect(UPDATES[index - 1].date > UPDATES[index].date).toBe(true);
        }
    });

    test("gives every entry at least one non-empty bullet", () => {
        for (const entry of UPDATES) {
            const items = bullets(entry);
            expect(items.length).toBeGreaterThan(0);
            for (const item of items) {
                expect(item.trim().length).toBeGreaterThan(0);
            }
        }
    });

    test("keeps optional titles non-empty", () => {
        for (const entry of UPDATES) {
            if (entry.title !== undefined) {
                expect(entry.title.trim().length).toBeGreaterThan(0);
            }
        }
    });

    test("gives every in-app date a CHANGELOG section", () => {
        const dated = new Set(
            [...changelog.matchAll(/^## (\d{4}-\d{2}-\d{2})$/gm)].map(
                (match) => match[1],
            ),
        );
        for (const entry of UPDATES) {
            expect(dated.has(entry.date)).toBe(true);
        }
    });
});
