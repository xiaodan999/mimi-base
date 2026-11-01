import { useRef, useState } from "react";

import { shuffle, touchDay } from "../engine";
import { toast } from "../toast";
import { useStudy } from "./StudyContext";

export default function TermsSection() {
    const { subject, progress, update } = useStudy();
    const [order] = useState(() =>
        shuffle(subject.bank.filter((item) => item.type === "term")).map(
            (item) => item.id,
        ),
    );
    const [index, setIndex] = useState(0);
    const [flipped, setFlipped] = useState(false);
    const touch = useRef({ x: 0, y: 0, moved: false });

    const terms = subject.bank.filter((item) => item.type === "term");
    const current = terms.find((item) => item.id === order[index]) ?? terms[0];

    const go = (delta: number) => {
        setFlipped(false);
        setIndex((prev) => (prev + delta + order.length) % order.length);
    };

    const mark = (known: boolean) => {
        update((current_) => {
            const wrong = { ...current_.wrong };
            if (known) {
                delete wrong[current.id];
            } else {
                wrong[current.id] = {
                    c: (wrong[current.id]?.c ?? 0) + 1,
                    t: Date.now(),
                };
            }
            return touchDay({
                ...current_,
                wrong,
                terms: {
                    ...current_.terms,
                    [current.id]: {
                        ...current_.terms[current.id],
                        k: known ? 1 : 0,
                    },
                },
            });
        });
        toast(known ? "记住了 ✓" : "已加入错题本");
        go(1);
    };

    const knownCount = Object.values(progress.terms).filter(
        (item) => item.k,
    ).length;

    return (
        <div>
            <div className="st-between" style={{ marginBottom: 10 }}>
                <span className="st-chip b">名词解释</span>
                <span className="st-tiny">
                    {index + 1} / {order.length} · 认识 {knownCount}
                </span>
            </div>

            <div
                className={`flip ${flipped ? "on" : ""}`}
                onClick={() => setFlipped((v) => !v)}
                onTouchStart={(event) => {
                    touch.current = {
                        x: event.touches[0].clientX,
                        y: event.touches[0].clientY,
                        moved: false,
                    };
                }}
                onTouchEnd={(event) => {
                    const dx =
                        event.changedTouches[0].clientX - touch.current.x;
                    const dy =
                        event.changedTouches[0].clientY - touch.current.y;
                    if (
                        Math.abs(dx) > 55 &&
                        Math.abs(dx) > Math.abs(dy) * 1.3
                    ) {
                        touch.current.moved = true;
                        go(dx < 0 ? 1 : -1);
                    }
                }}
            >
                <div className="flip-in">
                    <div className="face face-front">
                        <div className="term">{current.stem}</div>
                        <div className="hint">点击卡片翻面看答案 👆</div>
                    </div>
                    <div className="face face-back">
                        <div className="bt">参考答案</div>
                        <div className="bd">{current.ans}</div>
                        <div className="key">
                            关键词：{current.keys.join(" · ")}
                        </div>
                    </div>
                </div>
            </div>

            <div className="st-row" style={{ gap: 8 }}>
                <button
                    className="st-btn ghost"
                    style={{ flex: 1 }}
                    onClick={() => go(-1)}
                >
                    上一个
                </button>
                <button
                    className="st-btn"
                    style={{ flex: 1 }}
                    onClick={() => go(1)}
                >
                    下一个
                </button>
            </div>
            <div className="st-row mt-2" style={{ gap: 8 }}>
                <button
                    className="st-btn ghost"
                    style={{ flex: 1 }}
                    onClick={() => mark(true)}
                >
                    ✅ 我记住了
                </button>
                <button
                    className="st-btn ghost"
                    style={{ flex: 1 }}
                    onClick={() => mark(false)}
                >
                    🔁 还不熟
                </button>
            </div>
            <div className="st-tiny st-center mt-3">
                共 {order.length} 个名词解释 · 左右滑动或点按钮切换
            </div>
        </div>
    );
}
