import { describe, expect, test } from "bun:test";

import { renderRichText } from "./rich-text";

type Node = { type: unknown; props: { children?: unknown } };

function nodes(value: string): Node[] {
    return renderRichText(value) as unknown as Node[];
}

function text(value: string): string {
    return nodes(value)
        .map((node) => String(node.props?.children ?? ""))
        .join("");
}

describe("renderRichText", () => {
    test("纯文本原样输出", () => {
        expect(text("普通文本")).toBe("普通文本");
    });

    test("<b> / <strong> 渲染成加粗节点", () => {
        const result = nodes("前<b>重点</b>后");
        expect(result).toHaveLength(3);
        expect(result[1].type).toBe("strong");
        expect(result[1].props.children).toBe("重点");
    });

    test("<br> 渲染成换行节点", () => {
        expect(nodes("上<br>下").some((node) => node.type === "br")).toBe(true);
    });

    test("HTML 实体被还原成文字", () => {
        expect(text("A&amp;B&nbsp;C")).toBe("A&B\u00a0C");
        expect(text("&#39;引号&#39;")).toBe("'引号'");
    });

    test("未知标签只保留文字，不会生成元素", () => {
        const result = nodes(
            '<script>alert("x")</script><img src=x onerror=alert(1)>',
        );
        expect(result.every((node) => node.type !== "script")).toBe(true);
        expect(result.every((node) => node.type !== "img")).toBe(true);
        expect(text('<script>alert("x")</script>')).toBe('alert("x")');
    });
});
