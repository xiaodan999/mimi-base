import { useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";

import { useAi } from "@/app/ai/AiContext";
import AiPanel from "@/app/ai/AiPanel";
import { CARD_CHIPS, explainCardMessages } from "@/app/ai/prompts";

import { bumpDaily, shuffle } from "../engine";
import { gameForCard } from "../games/registry";
import { toast } from "../toast";
import type { Card, QuizItem } from "../types";
import CardDemo from "./CardDemo";
import QuizRunner from "./QuizRunner";
import { useStudy } from "./StudyContext";

const TAG_CLASS: Record<string, string> = {
    易错: "r",
    高频: "w",
    衍生: "p",
};

function CardItem({
    card,
    subjectId,
    moduleColor,
    moduleIcon,
    known,
    played,
    canDrill,
    focused,
    onToggle,
    onDrill,
    onExplain,
}: {
    card: Card;
    subjectId: string;
    moduleColor: string;
    moduleIcon: string;
    known: boolean;
    played: boolean;
    canDrill: boolean;
    focused: boolean;
    onToggle: () => void;
    onDrill: () => void;
    onExplain: () => void;
}) {
    const html = (value: string) => ({ __html: value });
    const game = gameForCard(card.id);

    return (
        <article
            className={`kcard ${focused ? "focused" : ""}`}
            data-card-id={card.id}
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
                        {played && <span className="st-chip b">🎮 已互动</span>}
                        {game && <span className="st-chip b">⚔️ 有实战</span>}
                    </div>
                </div>
            </div>

            <div className="kcard-b">
                <CardDemo card={card} />

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

            <div className="kcard-foot" style={{ flexWrap: "wrap" }}>
                <button
                    className={`st-btn sm ${known ? "ghost" : "line"}`}
                    onClick={onToggle}
                >
                    {known ? "取消掌握" : "✓ 标记已掌握"}
                </button>
                {canDrill && (
                    <button className="st-btn sm ghost" onClick={onDrill}>
                        做这张卡的题
                    </button>
                )}
                {game && (
                    <Link
                        to="/study/$subjectId/$section"
                        params={{ subjectId, section: "games" }}
                        search={{ game: game.id }}
                        className="st-btn sm line"
                    >
                        🎮 去实战：{game.title}
                    </Link>
                )}
                <button
                    className="st-btn sm line"
                    style={{ flex: "1 1 100%" }}
                    onClick={onExplain}
                >
                    🤖 AI 讲给我听
                </button>
            </div>
        </article>
    );
}

export default function CardsSection({
    moduleId,
    focusCard,
}: {
    moduleId?: string;
    /** 从实战结算跳过来时，定位到具体这张卡 */
    focusCard?: string;
}) {
    const { subject, progress, update } = useStudy();
    const { configured, openSettings } = useAi();
    const [drill, setDrill] = useState<QuizItem[] | null>(null);
    const [explainId, setExplainId] = useState<string | null>(null);

    const module = subject.modules.find((m) => m.id === moduleId);
    const cards = moduleId ? subject.cards.filter((c) => c.m === moduleId) : [];
    const explainCard = explainId
        ? (subject.cards.find((card) => card.id === explainId) ?? null)
        : null;

    useEffect(() => {
        if (!focusCard) return;
        const target = document.querySelector(`[data-card-id="${focusCard}"]`);
        target?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, [focusCard]);
    const explainModule = explainCard
        ? subject.modules.find((mod) => mod.id === explainCard.m)
        : undefined;
    const explainMessages = useMemo(
        () =>
            explainCard
                ? explainCardMessages(subject, explainCard, explainModule?.name)
                : [],
        [explainCard, explainModule?.name, subject],
    );

    const openExplain = (card: Card) => {
        if (!configured) {
            openSettings();
            toast("先配置一下 AI Key");
            return;
        }
        setExplainId(card.id);
    };

    // 打开模块即视为「看过」
    useEffect(() => {
        if (!moduleId) return;
        const list = subject.cards.filter((c) => c.m === moduleId);
        const missing = list.some((c) => !progress.cards[c.id]?.seen);
        if (!missing) return;
        update((current) => {
            const next = { ...current.cards };
            let newlySeen = 0;
            for (const card of list) {
                if (!current.cards[card.id]?.seen) newlySeen += 1;
                next[card.id] = { ...next[card.id], seen: 1 };
            }
            if (!newlySeen) return current;
            return bumpDaily({ ...current, cards: next }, { cards: newlySeen });
        });
    }, [moduleId, subject.cards, progress.cards, update]);

    const startDrill = (card: Card) => {
        const pool = subject.bank.filter((item) => item.card === card.id);
        if (!pool.length) {
            toast("这张卡还没有专属题目，去刷题页练整个模块吧");
            return;
        }
        setDrill(shuffle(pool).slice(0, 8));
    };

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
    const played = cards.filter((c) => progress.widgets?.[c.id]?.done).length;

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
                    🎮 {played}/{cards.length} 已互动
                </span>
                <span className="st-chip g">
                    {known}/{cards.length} 已掌握
                </span>
            </div>

            {cards.map((card) => (
                <CardItem
                    key={card.id}
                    card={card}
                    subjectId={subject.id}
                    moduleColor={module.c}
                    moduleIcon={module.icon}
                    known={Boolean(progress.cards[card.id]?.k)}
                    played={Boolean(progress.widgets?.[card.id]?.done)}
                    focused={focusCard === card.id}
                    canDrill={subject.bank.some(
                        (item) => item.card === card.id,
                    )}
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
                    onDrill={() => startDrill(card)}
                    onExplain={() => openExplain(card)}
                />
            ))}

            <AiPanel
                open={Boolean(explainCard)}
                onClose={() => setExplainId(null)}
                title={explainCard ? `AI 讲卡 · ${explainCard.t}` : "AI 讲卡"}
                subtitle={explainModule?.name}
                cacheKey={explainCard ? `card:${explainCard.id}` : "card:none"}
                messages={explainMessages}
                chips={CARD_CHIPS}
                intro="不懂就追问，AI 会用生活里的例子讲。"
            />

            {/* 保留卡片列表挂载，退出做题后滚动位置不丢 */}
            {drill && (
                <QuizRunner
                    items={drill}
                    mode="practice"
                    onExit={() => setDrill(null)}
                />
            )}
        </div>
    );
}
