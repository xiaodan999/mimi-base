import { useStudy } from "./StudyContext";
import { renderRichText } from "./rich-text";

export default function MemoSection() {
    const { subject } = useStudy();
    const cards = subject.cards.filter((card) => card.memo);

    return (
        <div>
            <div className="st-card">
                <div className="text-[13px] font-extrabold">
                    🧠 考前 10 分钟只看这一页
                </div>
                <div className="st-tiny mt-1">
                    全部口诀汇总，按模块排列。记不住的知识点，先记口诀，考场再回忆。
                </div>
            </div>

            {cards.map((card) => {
                const module = subject.modules.find((m) => m.id === card.m);
                return (
                    <div
                        className="st-card"
                        key={card.id}
                        style={
                            {
                                "--mc": module?.c ?? "var(--brand)",
                            } as React.CSSProperties
                        }
                    >
                        <div className="st-row" style={{ gap: 8 }}>
                            <span className="st-chip b">{module?.name}</span>
                        </div>
                        <div className="mt-1 text-[14px] font-extrabold">
                            {card.t}
                        </div>
                        <div
                            className="mt-1 text-[14px]"
                            style={{ lineHeight: 1.75 }}
                        >
                            {renderRichText(card.memo ?? "")}
                        </div>
                    </div>
                );
            })}
        </div>
    );
}
