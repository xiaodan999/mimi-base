import type { BadgeDef } from "../meta";
import RelatedLinks from "./RelatedLinks";

export type ResultDetail = {
    title: string;
    ok: boolean;
    note?: string;
};

type Props = {
    title: string;
    subtitle: string;
    score: number;
    stars: number;
    xpGained: number;
    isBest: boolean;
    unlocked: BadgeDef[];
    details: ResultDetail[];
    /** 单位，例如「处」「关」 */
    unit: string;
    correct: number;
    total: number;
    /** 传入后会在结算页展示关联模块 / 知识卡 */
    gameId?: string;
    onRetry: () => void;
    onExit: () => void;
};

export default function ResultPanel({
    title,
    subtitle,
    score,
    stars,
    xpGained,
    isBest,
    unlocked,
    details,
    unit,
    correct,
    total,
    gameId,
    onRetry,
    onExit,
}: Props) {
    return (
        <div className="game-result">
            <div className="gr-kicker">{title}</div>
            <div className="gr-stars" aria-label={`${stars} 星`}>
                {[0, 1, 2].map((index) => (
                    <span
                        key={index}
                        className={index < stars ? "on" : ""}
                        aria-hidden="true"
                    >
                        ★
                    </span>
                ))}
            </div>
            <div className="gr-score">
                {score}
                <small>分</small>
            </div>
            <div className="gr-sub">{subtitle}</div>

            <div className="gr-chips">
                <span className="gr-chip xp">+{xpGained} XP</span>
                {isBest && <span className="gr-chip best">新纪录</span>}
                <span className="gr-chip">
                    {correct}/{total} {unit}
                </span>
            </div>

            {unlocked.length > 0 && (
                <div className="gr-unlock">
                    <div className="gr-unlock-h">解锁徽章</div>
                    <div className="gr-unlock-list">
                        {unlocked.map((badge) => (
                            <span className="gr-badge" key={badge.id}>
                                <span aria-hidden="true">{badge.icon}</span>
                                {badge.name}
                            </span>
                        ))}
                    </div>
                </div>
            )}

            <div className="gr-list">
                {details.map((detail, index) => (
                    <div
                        className={`gr-row ${detail.ok ? "ok" : "bad"}`}
                        key={`${detail.title}-${index}`}
                    >
                        <span className="gr-mark" aria-hidden="true">
                            {detail.ok ? "✓" : "×"}
                        </span>
                        <span className="min-w-0 flex-1">
                            <b>{detail.title}</b>
                            {detail.note && (
                                <span className="gr-note">{detail.note}</span>
                            )}
                        </span>
                    </div>
                ))}
            </div>

            {gameId && <RelatedLinks gameId={gameId} />}

            <div className="gr-actions">
                <button className="g-btn primary" onClick={onRetry}>
                    再来一局
                </button>
                <button className="g-btn ghost" onClick={onExit}>
                    返回病区
                </button>
            </div>
        </div>
    );
}
