import { describe, expect, test } from "bun:test";

import { commentPreviews } from "./tool-comments";

describe("commentPreviews", () => {
    test("maps comments to author/text/reply rows and caps the preview", () => {
        const items = Array.from({ length: 6 }, (_, index) => ({
            id: `c${index}`,
            by: index % 2 === 0 ? "小海" : "小满",
            text: `第 ${index} 条评论`,
            images: 0,
            replyTo: index === 1 ? "小海" : "",
        }));
        const preview = commentPreviews({ ok: true, items });
        expect(preview.total).toBe(6);
        expect(preview.items).toHaveLength(4);
        expect(preview.items[1]).toEqual({
            id: "c1",
            by: "小满",
            text: "第 1 条评论",
            replyTo: "小海",
        });
    });

    test("keeps image-only comments and shortens long text", () => {
        const preview = commentPreviews({
            items: [
                { id: "a", by: "小海", text: "", images: 2 },
                { id: "b", by: "小满", text: "很".repeat(200), images: 0 },
            ],
        });
        expect(preview.items[0]).toMatchObject({
            by: "小海",
            text: "（图片评论）",
        });
        expect(preview.items[1].text.endsWith("…")).toBe(true);
        expect(preview.items[1].text.length).toBeLessThanOrEqual(141);
    });

    test("skips junk rows and returns empty for junk results", () => {
        expect(
            commentPreviews({
                items: [
                    null,
                    "junk",
                    { by: "", text: "无作者" },
                    { by: "小海" },
                ],
            }),
        ).toEqual({ items: [], total: 0 });
        expect(commentPreviews(undefined)).toEqual({ items: [], total: 0 });
        expect(commentPreviews({ items: "nope" })).toEqual({
            items: [],
            total: 0,
        });
    });
});
