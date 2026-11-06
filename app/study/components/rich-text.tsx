import { Fragment, type ReactNode } from "react";

/** 卡片内容里只用到这几种实体，安全地还原成文本，不再依赖 innerHTML 解析。 */
const ENTITIES: Record<string, string> = {
    amp: "&",
    lt: "<",
    gt: ">",
    quot: '"',
    apos: "'",
    nbsp: "\u00a0",
    "#39": "'",
};

function decodeEntities(text: string): string {
    return text.replace(/&(#?\w+);/g, (whole, name: string) => {
        const mapped = ENTITIES[name.toLowerCase()];
        if (mapped !== undefined) return mapped;
        if (name.startsWith("#")) {
            const code = Number(name.slice(1));
            return Number.isFinite(code) ? String.fromCodePoint(code) : whole;
        }
        return whole;
    });
}

/**
 * 把卡片内容里的极简富文本（<b>/<strong> 加粗、<br> 换行）安全地渲染成
 * React 节点，替代 dangerouslySetInnerHTML。其余未知标签只保留文字内容，
 * 永远不会把字符串当作 HTML 执行。
 */
export function renderRichText(value: string): ReactNode[] {
    const parts = value.split(/(<b>|<\/b>|<strong>|<\/strong>|<br\s*\/?>)/gi);
    const nodes: ReactNode[] = [];
    let bold = false;
    let key = 0;
    for (const part of parts) {
        if (!part) continue;
        const lower = part.toLowerCase();
        if (lower === "<b>" || lower === "<strong>") {
            bold = true;
            continue;
        }
        if (lower === "</b>" || lower === "</strong>") {
            bold = false;
            continue;
        }
        if (/^<br\s*\/?>$/i.test(part)) {
            nodes.push(<br key={key++} />);
            continue;
        }
        // 去掉其它残留标签，只保留纯文本
        const text = decodeEntities(part.replace(/<[^>]*>/g, ""));
        if (!text) continue;
        nodes.push(
            bold ? (
                <strong key={key++}>{text}</strong>
            ) : (
                <Fragment key={key++}>{text}</Fragment>
            ),
        );
    }
    return nodes;
}
