import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";

import { shuffle } from "../engine";
import type { Card, QuizItem } from "../types";
import Demo from "./Demo";
import QuizRunner from "./QuizRunner";
import { useStudy } from "./StudyContext";

const TAG_CLASS: Record<string, string> = {
    易错: "r",
    高频: "w",
    衍生: "p",
};

function CardItem({
    card,
    moduleColor,
    moduleIcon,
    known,
    onToggle,
    onDrill,
}: {
    card: Card;
    moduleColor: string;
    moduleIcon: string;
    known: boolean;
    onToggle: () => void;
    onDrill: () => void;
}) {
    const html = (value: string) => ({ __html: value });

    return (
        <article
            className="kcard"
            style={{ "--mc": moduleColor } as React.CSSProperties}
        >
            <div className="kcard-h">
                <div className="kcard-ic">{moduleIcon}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                    <h3>{card.t}</h3>
                    <div className="st-row" style={{ gap: 6, marginTop: 5 }}>
                        <span
                            className={`st-chip ${TAG_CLASS[card.tag] ?? "b"}`}
                        >
                            {card.tag}
                        </span>
                        {known && <span className="st-chip g">✓ 已掌握</span>}
                    </div>
                </div>
            </div>

            <div className="kcard-b">
                {card.demo && <Demo id={card.demo} arg={card.demoArg} />}

                {card.points && (
                    <ul>
                        {card.points.map((point, i) => (
                            <li key={i} dangerouslySetInnerHTML={html(point)} />
                        ))}
                    </ul>
                )}

                {card.table && (
                    <>
                        <div className="tblwrap">
                            <table className="ktable">
                                {card.table.w &&
                                    card.table.w.length ===
                                        card.table.head.length && (
                                        <colgroup>
                                            {card.table.w.map((width, i) => (
                                                <col
                                                    key={i}
                                                    style={{ width }}
                                                />
                                            ))}
                                        </colgroup>
                                    )}
                                <thead>
                                    <tr>
                                        {card.table.head.map((head, i) => (
                                            <th key={i}>{head}</th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {card.table.rows.map((row, i) => (
                                        <tr key={i}>
                                            {row.map((cell, j) => (
                                                <td
                                                    key={j}
                                                    dangerouslySetInnerHTML={html(
                                                        cell,
                                                    )}
                                                />
                                            ))}
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                        {card.table.note && (
                            <div className="tnote">{card.table.note}</div>
                        )}
                    </>
                )}

                {card.sections?.map((section) => (
                    <div className="sec" key={section.h}>
                        <div className="sec-h">{section.h}</div>
                        <ul>
                            {section.items.map((line, i) => (
                                <li
                                    key={i}
                                    dangerouslySetInnerHTML={html(line)}
                                />
                            ))}
                        </ul>
                    </div>
                ))}

                {card.memo && (
                    <div
                        className="memo"
                        dangerouslySetInnerHTML={html(`🧠 ${card.memo}`)}
                    />
                )}
                {card.trap && (
                    <div
                        className="trap"
                        dangerouslySetInnerHTML={html(`⚠️ 易错：${card.trap}`)}
                    />
                )}
            </div>

            <div className="kcard-foot">
                <button
                    className={`st-btn sm ${known ? "ghost" : "line"}`}
                    onClick={onToggle}
                >
                    {known ? "取消掌握" : "✓ 标记已掌握"}
                </button>
                <button className="st-btn sm ghost" onClick={onDrill}>
                    做本模块题
                </button>
            </div>
        </article>
    );
}

export default function CardsSection({ moduleId }: { moduleId?: string }) {
    const { subject, progress, update } = useStudy();
    const [drill, setDrill] = useState<QuizItem[] | null>(null);

    const module = subject.modules.find((m) => m.id === moduleId);
    const cards = moduleId ? subject.cards.filter((c) => c.m === moduleId) : [];

    // 打开模块即视为「看过」
    useEffect(() => {
        if (!moduleId) return;
        const list = subject.cards.filter((c) => c.m === moduleId);
        const missing = list.some((c) => !progress.cards[c.id]?.seen);
        if (!missing) return;
        update((current) => {
            const next = { ...current.cards };
            for (const card of list) {
                next[card.id] = { ...next[card.id], seen: 1 };
            }
            return { ...current, cards: next };
        });
    }, [moduleId, subject.cards, progress.cards, update]);

    const startDrill = (modId: string) => {
        const pool = subject.bank.filter(
            (item) =>
                item.m === modId &&
                (item.type === "single" || item.type === "multi"),
        );
        if (!pool.length) return;
        setDrill(shuffle(pool).slice(0, 8));
    };

    if (drill) {
        return (
            <QuizRunner
                items={drill}
                mode="practice"
                onExit={() => setDrill(null)}
            />
        );
    }

    if (!module) {
        return (
            <div>
                <div className="st-sec" style={{ marginTop: 4 }}>
                    选择模块（共 {subject.cards.length} 张卡）
                </div>
                <div className="mod-grid">
                    {subject.modules.map((mod) => {
                        const list = subject.cards.filter(
                            (c) => c.m === mod.id,
                        );
                        const known = list.filter(
                            (c) => progress.cards[c.id]?.k,
                        ).length;
                        return (
                            <Link
                                key={mod.id}
                                to="/study/$subjectId/$section"
                                params={{
                                    subjectId: subject.id,
                                    section: "cards",
                                }}
                                search={{ m: mod.id }}
                                className="mod"
                                style={
                                    {
                                        "--mc": mod.c,
                                    } as React.CSSProperties
                                }
                            >
                                <span className="glow" />
                                <div className="mod-ic">{mod.icon}</div>
                                <div className="mod-t">{mod.name}</div>
                                <div className="mod-s">{mod.desc}</div>
                                <div className="mod-ring">
                                    {known}/{list.length}
                                </div>
                            </Link>
                        );
                    })}
                </div>
            </div>
        );
    }

    const known = cards.filter((c) => progress.cards[c.id]?.k).length;

    return (
        <div>
            <div className="st-row" style={{ gap: 10, marginBottom: 12 }}>
                <Link
                    to="/study/$subjectId/$section"
                    params={{ subjectId: subject.id, section: "cards" }}
                    className="st-btn sm ghost"
                >
                    ← 全部模块
                </Link>
                <div style={{ flex: 1 }} />
                <span className="st-chip b">
                    {known}/{cards.length} 已掌握
                </span>
            </div>

            {cards.map((card) => (
                <CardItem
                    key={card.id}
                    card={card}
                    moduleColor={module.c}
                    moduleIcon={module.icon}
                    known={Boolean(progress.cards[card.id]?.k)}
                    onToggle={() =>
                        update((current) => ({
                            ...current,
                            cards: {
                                ...current.cards,
                                [card.id]: {
                                    seen: 1,
                                    k: current.cards[card.id]?.k ? 0 : 1,
                                },
                            },
                        }))
                    }
                    onDrill={() => startDrill(card.m)}
                />
            ))}
        </div>
    );
}
