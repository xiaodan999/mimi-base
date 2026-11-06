import { describe, expect, test } from "bun:test";

import { deriveConversationTitle } from "./title";

describe("deriveConversationTitle", () => {
    test("uses the first non-empty line", () => {
        expect(deriveConversationTitle("\n  \n今天吃什么？\n第二条")).toBe(
            "今天吃什么？",
        );
    });

    test("strips markdown markers", () => {
        expect(deriveConversationTitle("## 一个小标题")).toBe("一个小标题");
        expect(deriveConversationTitle("- 列表项")).toBe("列表项");
        expect(deriveConversationTitle("`code` 是什么意思")).toBe(
            "code 是什么意思",
        );
    });

    test("collapses whitespace", () => {
        expect(deriveConversationTitle("帮我   写一段   文案")).toBe(
            "帮我 写一段 文案",
        );
    });

    test("truncates long titles with an ellipsis", () => {
        const title = deriveConversationTitle("一".repeat(40), 10);
        expect(Array.from(title)).toHaveLength(11);
        expect(title.endsWith("…")).toBe(true);
    });

    test("falls back for empty input", () => {
        expect(deriveConversationTitle("   ")).toBe("新对话");
    });
});
