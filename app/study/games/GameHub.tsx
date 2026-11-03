import { useEffect } from "react";
import { Link, useNavigate } from "@tanstack/react-router";

import { useStudy } from "../components/StudyContext";
import {
    DAILY_BONUS_XP,
    cardStats,
    dailyTaskStatus,
    daysLeft,
    questionStats,
    streakDays,
} from "../engine";
import { toast } from "../toast";
import type { Progress } from "../types";
import { BADGES, evaluateBadges, rankFor, totalPlays } from "./meta";
import {
    GAMES,
    gameForModule,
    isGameUnlocked,
    unlockText,
    type GameMeta,
} from "./registry";
import "./games.css";

function Stars({ value, size = 14 }: { value: number; size?: number }) {
    return (
        <span
            className="g-stars"
            style={{ fontSize: size }}
            aria-label={`${value} 星`}
        >
            {[0, 1, 2].map((index) => (
                <span key={index} className={index < value ? "on" : ""}>
                    ★
                </span>
            ))}
        </span>
    );
}

export default function GameHub() {
    const { subject, progress, update } = useStudy();
    const navigate = useNavigate();
    const rank = rankFor(progress.xp ?? 0);
    const tasks = dailyTaskStatus(progress);
    const doneCount = tasks.filter((task) => task.done).length;
    const allDone = doneCount === tasks.length;
    const streak = streakDays(progress);
    const earned = new Set(progress.badges ?? []);
    const plays = totalPlays(progress);
    const ready = GAMES.filter((game) => game.status === "ready");
    const boss = GAMES.find((game) => game.status === "boss");
    const cards = cardStats(subject, progress);
    const questions = questionStats(progress);
    const left = daysLeft(subject.examDate);
    const weakest = subject.modules
        .map((mod) => {
            const bank = subject.bank.filter((item) => item.m === mod.id);
            let done = 0;
            let right = 0;
            bank.forEach((item) => {
                const stat = progress.stat?.[item.id];
                if (!stat) return;
                done += stat.r + stat.w;
                right += stat.r;
            });
            return {
                mod,
                done,
                pct: done ? Math.round((right / done) * 100) : null,
            };
        })
        .filter((item) => item.done > 0)
        .sort((a, b) => (a.pct ?? 0) - (b.pct ?? 0))[0];
    const nextGame = weakest ? gameForModule(weakest.mod.id) : ready[0];

    // 徽章可能由总 XP、连续天数等跨游戏条件触发，进 hub 时补一次
    useEffect(() => {
        update((current) => {
            const next = evaluateBadges(current);
            return next.unlocked.length ? next.progress : current;
        });
    }, [update]);

    const enter = (game: GameMeta) => {
        if (!isGameUnlocked(game, progress)) {
            toast(
                game.status === "boss"
                    ? `先拿到 ${unlockText(game)}，夜班才会开放`
                    : "这个房间还在筹备中",
            );
            return;
        }
        void navigate({
            to: "/study/$subjectId/$section",
            params: { subjectId: subject.id, section: "games" },
            search: { game: game.id },
        });
    };

    return (
        <div className="game-hub">
            <section className="gh-hero">
                <div className="gh-rank-icon" aria-hidden="true">
                    {rank.rank.icon}
                </div>
                <div className="gh-rank-copy">
                    <div className="gh-eyebrow">实战训练 · {subject.title}</div>
                    <div className="gh-rank-name">{rank.rank.name}</div>
                    <div className="gh-xp">
                        <span className="gh-xp-bar">
                            <i
                                style={{
                                    width: `${Math.round(rank.progress * 100)}%`,
                                }}
                            />
                        </span>
                        <span>{progress.xp ?? 0} XP</span>
                    </div>
                    <div className="gh-rank-next">
                        {rank.next
                            ? `再 ${rank.toNext} XP 升到 ${rank.next.name}`
                            : "已经满级，去带教吧"}
                    </div>
                </div>
                <div className="gh-streak">
                    <b>{streak}</b>
                    <span>连续天数</span>
                </div>
            </section>

            <section className="gh-study" aria-label="学习进度">
                <div className="gh-study-cell">
                    <b>
                        {cards.known}/{cards.total}
                    </b>
                    <span>已掌握卡</span>
                </div>
                <div className="gh-study-cell">
                    <b>{questions.accuracy}%</b>
                    <span>刷题正确率</span>
                </div>
                <div className="gh-study-cell">
                    <b>{left ?? "—"}</b>
                    <span>{left === null ? "长期学习" : "距考试天数"}</span>
                </div>
            </section>

            <section className="gh-quest">
                <div className="gh-sec-head">
                    <h2>今日值班任务</h2>
                    <span>
                        {doneCount}/{tasks.length}
                    </span>
                </div>
                <div className="gh-quest-list">
                    {tasks.map((task) => {
                        const percent = Math.min(
                            100,
                            Math.round((task.n / task.target) * 100),
                        );
                        return (
                            <div
                                className={`gh-quest-row ${task.done ? "done" : ""}`}
                                key={task.id}
                            >
                                <span className="gh-quest-mark">
                                    {task.done ? "✓" : "○"}
                                </span>
                                <div className="gh-quest-copy">
                                    <div className="gh-quest-title">
                                        {task.label}
                                    </div>
                                    <div className="gh-quest-bar">
                                        <i style={{ width: `${percent}%` }} />
                                    </div>
                                </div>
                                <span className="gh-quest-n">
                                    {Math.min(task.n, task.target)}/
                                    {task.target}
                                    {task.unit}
                                </span>
                            </div>
                        );
                    })}
                </div>
                <div className={`gh-quest-foot ${allDone ? "on" : ""}`}>
                    {allDone
                        ? `今日全清，+${DAILY_BONUS_XP} XP 已到账`
                        : `三项全清额外 +${DAILY_BONUS_XP} XP`}
                </div>
            </section>

            <section className="gh-next">
                <div className="gh-sec-head">
                    <h2>下一步</h2>
                    <span>看卡 → 实战 → 刷题</span>
                </div>
                <div className="gh-next-body">
                    <div className="gh-next-copy">
                        <b>
                            {weakest
                                ? `${weakest.mod.icon} ${weakest.mod.name}`
                                : "从第一张知识卡开始"}
                        </b>
                        <span>
                            {weakest
                                ? `最近正确率 ${weakest.pct ?? 0}% · 已练 ${weakest.done} 题`
                                : "先过一遍知识卡，再回来实战"}
                        </span>
                    </div>
                    <div className="gh-next-actions">
                        <Link
                            to="/study/$subjectId/$section"
                            params={{
                                subjectId: subject.id,
                                section: "cards",
                            }}
                            search={weakest ? { m: weakest.mod.id } : undefined}
                            className="gh-next-btn"
                        >
                            📖 看卡
                        </Link>
                        {nextGame && (
                            <Link
                                to="/study/$subjectId/$section"
                                params={{
                                    subjectId: subject.id,
                                    section: "games",
                                }}
                                search={{ game: nextGame.id }}
                                className="gh-next-btn accent"
                            >
                                🎮 {nextGame.title}
                            </Link>
                        )}
                        <Link
                            to="/study/$subjectId/$section"
                            params={{
                                subjectId: subject.id,
                                section: "quiz",
                            }}
                            className="gh-next-btn"
                        >
                            ✍️ 刷题
                        </Link>
                    </div>
                </div>
                <div className="gh-next-note">
                    实战结算会把你带回对应知识卡，错题也会留在错题本里。
                </div>
            </section>

            <section className="gh-floor-wrap">
                <div className="gh-sec-head">
                    <h2>病区楼层</h2>
                    <span>点亮房间 · 进入实战</span>
                </div>
                <FloorPlan progress={progress} onEnter={enter} />
                {boss && (
                    <div className="gh-floor-note">
                        🌙 夜班 BOSS 解锁：{unlockText(boss)}
                        {isGameUnlocked(boss, progress) ? "（已开放）" : ""}
                    </div>
                )}
            </section>

            <section className="gh-games">
                {ready.map((game) => {
                    const saved = progress.games?.[game.id];
                    return (
                        <Link
                            key={game.id}
                            to="/study/$subjectId/$section"
                            params={{
                                subjectId: subject.id,
                                section: "games",
                            }}
                            search={{ game: game.id }}
                            className="gh-game-card"
                            style={
                                {
                                    "--accent": game.accent,
                                } as React.CSSProperties
                            }
                        >
                            <span className="gh-game-icon" aria-hidden="true">
                                {game.icon}
                            </span>
                            <span className="gh-game-copy">
                                <b>{game.title}</b>
                                <span>{game.subtitle}</span>
                                <p>{game.desc}</p>
                                <span className="gh-game-tags">
                                    {game.modules.slice(0, 3).map((id) => {
                                        const mod = subject.modules.find(
                                            (item) => item.id === id,
                                        );
                                        return mod ? (
                                            <span key={id}>
                                                {mod.icon} {mod.name}
                                            </span>
                                        ) : null;
                                    })}
                                    {game.modules.length > 3 && (
                                        <span>+{game.modules.length - 3}</span>
                                    )}
                                </span>
                            </span>
                            <span className="gh-game-meta">
                                <Stars value={saved?.stars ?? 0} />
                                <span>
                                    {saved
                                        ? `最佳 ${saved.best}`
                                        : `${game.minutes} 分钟`}
                                </span>
                            </span>
                        </Link>
                    );
                })}
            </section>

            <section className="gh-badges">
                <div className="gh-sec-head">
                    <h2>徽章墙</h2>
                    <span>
                        {earned.size}/{BADGES.length}
                    </span>
                </div>
                <div className="gh-badge-grid">
                    {BADGES.map((badge) => {
                        const on = earned.has(badge.id);
                        return (
                            <div
                                className={`gh-badge ${on ? "on" : ""}`}
                                key={badge.id}
                            >
                                <span
                                    className="gh-badge-icon"
                                    aria-hidden="true"
                                >
                                    {on ? badge.icon : "🔒"}
                                </span>
                                <b>{badge.name}</b>
                                <span>{badge.desc}</span>
                            </div>
                        );
                    })}
                </div>
            </section>

            <div className="gh-note">
                已实战 {plays} 局 ·
                所有病例都是教学模拟，临床执行以医院制度为准。
            </div>
        </div>
    );
}

function FloorPlan({
    progress,
    onEnter,
}: {
    progress: Progress;
    onEnter: (game: GameMeta) => void;
}) {
    const tiles = [...GAMES].sort(
        (a, b) =>
            a.grid[0] + a.grid[1] - (b.grid[0] + b.grid[1]) ||
            a.grid[1] - b.grid[1],
    );

    const iso = ([col, row]: [number, number]) => ({
        x: 172 + (col - row) * 58,
        y: 72 + (col + row) * 32,
    });

    return (
        <svg
            className="gh-floor"
            viewBox="0 0 360 220"
            role="group"
            aria-label="病区楼层图"
        >
            <defs>
                <linearGradient id="gh-floor-bg" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0" stopColor="#0c1728" />
                    <stop offset="1" stopColor="#111f34" />
                </linearGradient>
                <filter id="gh-soft-glow">
                    <feGaussianBlur stdDeviation="3" result="blur" />
                    <feMerge>
                        <feMergeNode in="blur" />
                        <feMergeNode in="SourceGraphic" />
                    </feMerge>
                </filter>
            </defs>

            <path
                d="M 172 24 L 344 118 L 172 212 L 0 118 Z"
                fill="url(#gh-floor-bg)"
                stroke="#24344d"
                strokeWidth="1.5"
            />
            <path
                d="M 172 40 L 318 120 L 172 200 L 26 120 Z"
                fill="none"
                stroke="#1d2d44"
                strokeDasharray="3 5"
            />

            {tiles.map((game) => {
                const { x, y } = iso(game.grid);
                const saved = progress.games?.[game.id];
                const stars = saved?.stars ?? 0;
                const unlocked = isGameUnlocked(game, progress);
                const playable = game.status !== "soon" && unlocked;
                const accent = game.status === "soon" ? "#475569" : game.accent;
                const top = `M ${x} ${y - 26} L ${x + 54} ${y} L ${x} ${y + 26} L ${x - 54} ${y} Z`;
                const left = `M ${x - 54} ${y} L ${x} ${y + 26} L ${x} ${y + 38} L ${x - 54} ${y + 12} Z`;
                const right = `M ${x + 54} ${y} L ${x} ${y + 26} L ${x} ${y + 38} L ${x + 54} ${y + 12} Z`;
                const status =
                    game.status === "soon"
                        ? "筹备中"
                        : game.status === "boss"
                          ? unlocked
                              ? "BOSS"
                              : "锁"
                          : unlocked
                            ? "实战"
                            : "锁";

                return (
                    <g
                        key={game.id}
                        className={`gh-floor-tile ${playable ? "ready" : "locked"}`}
                        role="button"
                        tabIndex={playable ? 0 : -1}
                        aria-label={`${game.room}：${game.title}，${status}${
                            playable
                                ? `，${stars} 星`
                                : game.status === "boss"
                                  ? `，解锁条件 ${unlockText(game)}`
                                  : ""
                        }`}
                        onClick={() => onEnter(game)}
                        onKeyDown={(event) => {
                            if (event.key === "Enter" || event.key === " ") {
                                event.preventDefault();
                                onEnter(game);
                            }
                        }}
                        style={{
                            cursor: playable ? "pointer" : "not-allowed",
                            filter:
                                saved?.stars === 3
                                    ? "url(#gh-soft-glow)"
                                    : undefined,
                        }}
                    >
                        <title>
                            {game.title} · {game.subtitle}
                        </title>
                        <path d={left} fill={accent} fillOpacity="0.22" />
                        <path d={right} fill={accent} fillOpacity="0.14" />
                        <path
                            d={top}
                            fill={accent}
                            fillOpacity={playable ? 0.2 : 0.08}
                            stroke={accent}
                            strokeWidth={playable ? 1.6 : 1}
                            strokeOpacity={playable ? 0.9 : 0.45}
                        />
                        <text
                            x={x}
                            y={y - 2}
                            textAnchor="middle"
                            fontSize="18"
                            opacity={playable ? 1 : 0.55}
                            style={{ pointerEvents: "none" }}
                            aria-hidden="true"
                        >
                            {game.icon}
                        </text>
                        <text
                            x={x}
                            y={y + 14}
                            textAnchor="middle"
                            fontSize="10"
                            fontWeight="800"
                            fill={playable ? "#e2e8f0" : "#64748b"}
                            style={{ pointerEvents: "none" }}
                            aria-hidden="true"
                        >
                            {game.room}
                        </text>
                        <text
                            x={x}
                            y={y + 26}
                            textAnchor="middle"
                            fontSize="8"
                            fontWeight="700"
                            fill={playable ? game.accent : "#64748b"}
                            style={{ pointerEvents: "none" }}
                            aria-hidden="true"
                        >
                            {playable ? (
                                <>
                                    {[0, 1, 2].map((index) => (
                                        <tspan
                                            key={index}
                                            fill={
                                                index < stars
                                                    ? "#fbbf24"
                                                    : "#334155"
                                            }
                                        >
                                            ★
                                        </tspan>
                                    ))}
                                </>
                            ) : (
                                status
                            )}
                        </text>
                        {playable && stars === 0 && (
                            <circle
                                cx={x + 40}
                                cy={y - 18}
                                r="3.2"
                                fill={game.accent}
                                aria-hidden="true"
                            >
                                <animate
                                    attributeName="opacity"
                                    values="1;0.25;1"
                                    dur="1.8s"
                                    repeatCount="indefinite"
                                />
                            </circle>
                        )}
                    </g>
                );
            })}
        </svg>
    );
}
