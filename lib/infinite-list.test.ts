import { describe, expect, test } from "bun:test";

import { flattenInfinitePages } from "./infinite-list";

type Item = { id: string };
type Page = { items: Item[] };

function pages(...items: Item[][]): { pages: Page[]; pageParams: number[] } {
    return {
        pages: items.map((page) => ({ items: page })),
        pageParams: items.map((_, index) => index + 1),
    };
}

const selectItems = (page: Page) => page.items;

describe("flattenInfinitePages", () => {
    test("returns no rows without data", () => {
        expect(flattenInfinitePages(undefined, selectItems)).toEqual([]);
    });

    test("flattens pages in load order", () => {
        const data = pages([{ id: "a" }, { id: "b" }], [{ id: "c" }]);
        expect(flattenInfinitePages(data, selectItems)).toEqual([
            { id: "a" },
            { id: "b" },
            { id: "c" },
        ]);
    });

    test("keeps repeated rows when no key is given", () => {
        const data = pages([{ id: "a" }], [{ id: "a" }]);
        expect(flattenInfinitePages(data, selectItems)).toHaveLength(2);
    });

    test("dedupes by key keeping the first occurrence", () => {
        const data = pages(
            [{ id: "a" }, { id: "b" }],
            [{ id: "b" }, { id: "c" }],
        );
        expect(
            flattenInfinitePages(data, selectItems, (item) => item.id),
        ).toEqual([{ id: "a" }, { id: "b" }, { id: "c" }]);
    });
});
