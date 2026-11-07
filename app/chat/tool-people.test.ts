import { describe, expect, test } from "bun:test";

import { expensesPeople, postAuthors } from "./tool-people";

describe("expensesPeople", () => {
    test("maps people to chips with money details, order preserved", () => {
        const chips = expensesPeople({
            ok: true,
            people: [
                {
                    id: "u2",
                    name: "阿黄",
                    avatar: "a.png",
                    mine: false,
                    total: 60.5,
                    count: 2,
                },
                {
                    id: "u1",
                    name: "我",
                    avatar: "",
                    mine: true,
                    total: 20,
                    count: 1,
                },
            ],
        });
        expect(chips).toEqual([
            { id: "u2", name: "阿黄", avatar: "a.png", detail: "¥60.50" },
            { id: "u1", name: "我", avatar: "", detail: "¥20" },
        ]);
    });

    test("skips nameless rows and junk, caps at 6", () => {
        const people: unknown[] = Array.from({ length: 8 }, (_, i) => ({
            id: `u${i}`,
            name: `人${i}`,
            avatar: "",
            mine: false,
            total: i,
            count: 1,
        }));
        people.splice(2, 0, { total: 5 }, "junk", null);
        const chips = expensesPeople({ people });
        expect(chips).toHaveLength(6);
        expect(chips[0].name).toBe("人0");
        expect(chips.every((chip) => chip.name !== "")).toBe(true);
    });

    test("returns empty for junk input", () => {
        expect(expensesPeople(undefined)).toEqual([]);
        expect(expensesPeople({ ok: false })).toEqual([]);
        expect(expensesPeople({ people: "nope" })).toEqual([]);
    });
});

describe("postAuthors", () => {
    test("aggregates distinct authors by count, most posts first", () => {
        const chips = postAuthors({
            ok: true,
            items: [
                { by: "阿黄", authorId: "u2", avatar: "a.png" },
                { by: "我", authorId: "u1", avatar: "" },
                { by: "阿黄", authorId: "u2", avatar: "a.png" },
                { by: "阿黄", authorId: "u2", avatar: "a.png" },
            ],
        });
        expect(chips).toEqual([
            { id: "u2", name: "阿黄", avatar: "a.png", detail: "3 条" },
            { id: "u1", name: "我", avatar: "", detail: "1 条" },
        ]);
    });

    test("merges by display name when the id is missing (old results)", () => {
        const chips = postAuthors({
            items: [
                { by: "阿黄", avatar: "" },
                { by: "阿黄", avatar: "" },
            ],
        });
        expect(chips).toEqual([
            { id: "阿黄", name: "阿黄", avatar: "", detail: "2 条" },
        ]);
    });

    test("returns empty for junk input", () => {
        expect(postAuthors(undefined)).toEqual([]);
        expect(postAuthors({ items: null })).toEqual([]);
    });
});
