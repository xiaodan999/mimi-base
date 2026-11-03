import { Link } from "@tanstack/react-router";

import { useStudy } from "../../components/StudyContext";
import { getGame } from "../registry";

/**
 * 游戏结算页的「回到学习材料」出口。
 * 把这一局用到的模块和知识卡直接链回去，避免实战变成孤岛。
 */
export default function RelatedLinks({ gameId }: { gameId: string }) {
    const { subject } = useStudy();
    const game = getGame(gameId);
    if (!game) return null;

    const cards = subject.cards.filter((card) => game.cards.includes(card.id));
    const modules = [...new Set(cards.map((card) => card.m))]
        .map((id) => subject.modules.find((module) => module.id === id))
        .filter((module): module is NonNullable<typeof module> =>
            Boolean(module),
        );

    return (
        <div className="gr-related">
            <div className="gr-related-h">🎮 这一局用到</div>
            <div className="gr-related-mods">
                {modules.map((module) => (
                    <Link
                        key={module.id}
                        to="/study/$subjectId/$section"
                        params={{
                            subjectId: subject.id,
                            section: "cards",
                        }}
                        search={{ m: module.id }}
                        className="gr-related-chip"
                    >
                        {module.icon} {module.name}
                    </Link>
                ))}
            </div>
            {cards.length > 0 && (
                <div className="gr-related-cards">
                    {cards.slice(0, 4).map((card) => (
                        <Link
                            key={card.id}
                            to="/study/$subjectId/$section"
                            params={{
                                subjectId: subject.id,
                                section: "cards",
                            }}
                            search={{ m: card.m, card: card.id }}
                            className="gr-related-card"
                        >
                            {card.t}
                        </Link>
                    ))}
                </div>
            )}
            <div className="gr-related-foot">
                <Link
                    to="/study/$subjectId/$section"
                    params={{ subjectId: subject.id, section: "quiz" }}
                    className="gr-related-more"
                >
                    去刷这部分题 →
                </Link>
                <span>{cards.length} 张关联知识卡</span>
            </div>
        </div>
    );
}
