import { useMemo } from "react";

import { Note, WidgetShell } from "./kit";
import { useWidgetState } from "./useWidget";
import type { Card, CardTable } from "../../types";
import { renderRichText } from "../rich-text";

type Part =
    | { type: "html"; html: string }
    | { type: "blank"; key: string; html: string };

type RecallLine = { key: string; parts: Part[] };

function stripTags(html: string) {
    return html.replace(/<[^>]+>/g, "");
}

function splitBold(html: string, prefix: string): Part[] {
    const parts: Part[] = [];
    const regex = /<b>(.*?)<\/b>/g;
    let last = 0;
    let index = 0;
    let match = regex.exec(html);

    while (match) {
        if (match.index > last) {
            parts.push({ type: "html", html: html.slice(last, match.index) });
        }
        parts.push({
            type: "blank",
            key: `${prefix}-b${index}`,
            html: match[1],
        });
        last = regex.lastIndex;
        index += 1;
        match = regex.exec(html);
    }

    if (last < html.length) {
        parts.push({ type: "html", html: html.slice(last) });
    }

    return parts;
}

function buildLines(card: Card): RecallLine[] {
    if (card.points?.length) {
        return card.points.map((html, index) => ({
            key: `p${index}`,
            parts: splitBold(html, `p${index}`),
        }));
    }
    if (card.sections?.length) {
        return card.sections.flatMap((section, sectionIndex) =>
            section.items.map((html, itemIndex) => ({
                key: `s${sectionIndex}-${itemIndex}`,
                parts: splitBold(html, `s${sectionIndex}-${itemIndex}`),
            })),
        );
    }
    return [];
}

function tableBlanks(table: CardTable) {
    return table.rows.flatMap((row, rowIndex) =>
        row
            .slice(1)
            .map((cell, cellIndex) => ({
                key: `t${rowIndex}-${cellIndex + 1}`,
                html: cell,
                empty: !cell.trim(),
            }))
            .filter((cell) => !cell.empty),
    );
}

function Blank({
    html,
    blankKey,
    revealed,
    onToggle,
}: {
    html: string;
    blankKey: string;
    revealed: boolean;
    onToggle: (key: string) => void;
}) {
    const length = stripTags(html).length;
    return (
        <button
            type="button"
            className={`iw-blank ${revealed ? "on" : ""}`}
            style={{ minWidth: `${Math.min(7, Math.max(2, length))}em` }}
            onClick={() => onToggle(blankKey)}
            aria-pressed={revealed}
        >
            {revealed ? (
                <span>{renderRichText(html)}</span>
            ) : (
                <span className="iw-blank-mask">点我</span>
            )}
        </button>
    );
}

export default function GenericRecall({ card }: { card: Card }) {
    const { state, patch } = useWidgetState(card.id);
    const checks = state.checks ?? [];
    const lines = useMemo(() => buildLines(card), [card]);
    const tableCells = useMemo(
        () => (card.table ? tableBlanks(card.table) : []),
        [card.table],
    );
    const lineBlanks = lines.flatMap((line) =>
        line.parts.filter(
            (part): part is Extract<Part, { type: "blank" }> =>
                part.type === "blank",
        ),
    );
    const total = lineBlanks.length + tableCells.length;
    const revealed = [
        ...lineBlanks.map((blank) => blank.key),
        ...tableCells.map((cell) => cell.key),
    ].filter((key) => checks.includes(key)).length;

    const toggle = (key: string) => {
        const next = checks.includes(key)
            ? checks.filter((item) => item !== key)
            : [...checks, key];
        patch({
            checks: next,
            done:
                next.length >= total && total > 0
                    ? 1
                    : (state.done ?? undefined),
        });
    };

    const fallback = total === 0;
    const fallbackOpen = checks.includes("memo");

    if (fallback) {
        return (
            <WidgetShell hint="先自己回忆，再点开口诀">
                <button
                    type="button"
                    className={`iw-flip ${fallbackOpen ? "on" : ""}`}
                    onClick={() => {
                        const next = fallbackOpen
                            ? checks.filter((key) => key !== "memo")
                            : [...checks, "memo"];
                        patch({
                            checks: next,
                            done: next.includes("memo")
                                ? 1
                                : (state.done ?? undefined),
                        });
                    }}
                >
                    <span className="iw-flip-front">
                        <b>这张卡的核心口诀是什么？</b>
                        <small>点一下翻开</small>
                    </span>
                    {fallbackOpen && (
                        <span className="iw-flip-back">
                            <span>
                                {renderRichText(
                                    card.memo ?? card.trap ?? card.t,
                                )}
                            </span>
                            {card.trap && (
                                <em>{renderRichText(`⚠️ ${card.trap}`)}</em>
                            )}
                        </span>
                    )}
                </button>
            </WidgetShell>
        );
    }

    return (
        <WidgetShell hint="先回忆，再点「点我」揭示关键词">
            <div className="iw-recall-head">
                <span>
                    已揭示 {revealed}/{total}
                </span>
                <button
                    type="button"
                    className="iw-btn ghost sm"
                    onClick={() => patch({ checks: [] })}
                >
                    再背一遍
                </button>
            </div>

            {lines.length > 0 && (
                <ul className="iw-recall-list">
                    {lines.map((line) => (
                        <li key={line.key}>
                            {line.parts.map((part, index) =>
                                part.type === "html" ? (
                                    <span key={index}>
                                        {renderRichText(part.html)}
                                    </span>
                                ) : (
                                    <Blank
                                        key={part.key}
                                        html={part.html}
                                        blankKey={part.key}
                                        revealed={checks.includes(part.key)}
                                        onToggle={toggle}
                                    />
                                ),
                            )}
                        </li>
                    ))}
                </ul>
            )}

            {lines.length === 0 && card.table && (
                <div className="iw-recall-table">
                    {card.table.rows.map((row, rowIndex) => (
                        <div className="iw-recall-row" key={rowIndex}>
                            <div className="iw-recall-label">
                                {renderRichText(row[0])}
                            </div>
                            <div className="iw-recall-cells">
                                {row.slice(1).map((cell, cellIndex) => {
                                    if (!cell.trim()) return null;
                                    const key = `t${rowIndex}-${cellIndex + 1}`;
                                    return (
                                        <Blank
                                            key={key}
                                            html={cell}
                                            blankKey={key}
                                            revealed={checks.includes(key)}
                                            onToggle={toggle}
                                        />
                                    );
                                })}
                            </div>
                        </div>
                    ))}
                </div>
            )}

            <Note tone={revealed >= total ? "ok" : "warn"}>
                {revealed >= total
                    ? "✓ 全部揭示。合上卡片，再自己复述一遍。"
                    : "遮住的是考点关键词；先想，再点开。全部揭示后可以标记掌握。"}
            </Note>
        </WidgetShell>
    );
}
