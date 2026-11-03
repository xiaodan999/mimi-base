import { bumpDaily, streakDays } from "../engine";
import type { GameProgress, Progress } from "../types";

/** 单局结算数据，所有小游戏都收敛成这个结构 */
export type GameResult = {
    /** 百分制得分 */
    score: number;
    stars: 0 | 1 | 2 | 3;
    /** 答对/找出的项目数 */
    correct: number;
    /** 总项目数 */
    total: number;
    durationMs: number;
    /** 最高连击 */
    combo?: number;
    /** 失误次数（输血密室叫 near miss） */
    nearMiss?: number;
    /** 是否完成整局；中途失败为 false */
    completed: boolean;
};

/* ---------------- 等级 ---------------- */

export type RankDef = {
    id: string;
    name: string;
    minXp: number;
    icon: string;
    note: string;
};

export const RANKS: RankDef[] = [
    {
        id: "intern",
        name: "实习护士",
        minXp: 0,
        icon: "🎓",
        note: "先把流程跑熟",
    },
    {
        id: "nurse",
        name: "护士",
        minXp: 150,
        icon: "🩺",
        note: "开始独立值班",
    },
    {
        id: "senior",
        name: "护师",
        minXp: 400,
        icon: "🎖️",
        note: "能带教新人了",
    },
    {
        id: "charge",
        name: "主管护师",
        minXp: 800,
        icon: "🏅",
        note: "质控骨干",
    },
    {
        id: "head",
        name: "护士长",
        minXp: 1400,
        icon: "👩‍⚕️",
        note: "全场最稳",
    },
    {
        id: "expert",
        name: "护理专家",
        minXp: 2200,
        icon: "🏆",
        note: "教科书本人",
    },
];

export function rankFor(xp: number) {
    let index = 0;
    RANKS.forEach((rank, i) => {
        if (xp >= rank.minXp) index = i;
    });
    const rank = RANKS[index];
    const next = RANKS[index + 1] ?? null;
    const span = next ? next.minXp - rank.minXp : 0;
    return {
        rank,
        next,
        progress: next ? Math.max(0, Math.min(1, (xp - rank.minXp) / span)) : 1,
        toNext: next ? Math.max(0, next.minXp - xp) : 0,
    };
}

/* ----------------  XP  ---------------- */

export function gameXp(result: GameResult): number {
    if (!result.completed) return 10;
    return 20 + result.stars * 10 + Math.round(result.score / 20);
}

/* ---------------- 徽章 ---------------- */

export type BadgeDef = {
    id: string;
    name: string;
    desc: string;
    icon: string;
    check: (progress: Progress) => boolean;
};

export const BADGES: BadgeDef[] = [
    {
        id: "first-game",
        name: "初次上台",
        desc: "完成第一局实战",
        icon: "🩺",
        check: (p) => totalPlays(p) >= 1,
    },
    {
        id: "sharp-eye",
        name: "火眼金睛",
        desc: "《夜巡》拿到 3 星",
        icon: "🔎",
        check: (p) => (p.games?.["ward-hazard"]?.stars ?? 0) >= 3,
    },
    {
        id: "blood-master",
        name: "一袋不错",
        desc: "《输血密室》拿到 3 星",
        icon: "🩸",
        check: (p) => (p.games?.["blood-room"]?.stars ?? 0) >= 3,
    },
    {
        id: "shock-master",
        name: "一电即中",
        desc: "《除颤时刻》拿到 3 星",
        icon: "🫀",
        check: (p) => (p.games?.["defib"]?.stars ?? 0) >= 3,
    },
    {
        id: "skin-deep",
        name: "看透皮肤",
        desc: "《皮肤之下》拿到 3 星",
        icon: "🔬",
        check: (p) => (p.games?.["skin"]?.stars ?? 0) >= 3,
    },
    {
        id: "night-shift",
        name: "零差错夜班",
        desc: "《20:00 夜班》拿到 80 分以上",
        icon: "🌙",
        check: (p) => (p.games?.["shift"]?.best ?? 0) >= 80,
    },
    {
        id: "combo-10",
        name: "十连警戒",
        desc: "《夜巡》单局连击达到 10",
        icon: "⚡",
        check: (p) => (p.games?.["ward-hazard"]?.bestCombo ?? 0) >= 10,
    },
    {
        id: "rank-nurse",
        name: "护师上线",
        desc: "累计 400 XP",
        icon: "🎖️",
        check: (p) => (p.xp ?? 0) >= 400,
    },
    {
        id: "streak-7",
        name: "七日值守",
        desc: "连续学习 7 天",
        icon: "🔥",
        check: (p) => streakDays(p) >= 7,
    },
];

export function totalPlays(progress: Progress): number {
    return Object.values(progress.games ?? {}).reduce(
        (sum, game) => sum + game.plays,
        0,
    );
}

/** 只补发还没拿到的徽章；没有新徽章时返回原对象 */
export function evaluateBadges(progress: Progress): {
    progress: Progress;
    unlocked: BadgeDef[];
} {
    const have = new Set(progress.badges ?? []);
    const unlocked = BADGES.filter(
        (badge) => !have.has(badge.id) && badge.check(progress),
    );
    if (!unlocked.length) return { progress, unlocked: [] };
    return {
        progress: {
            ...progress,
            badges: [...(progress.badges ?? []), ...unlocked.map((b) => b.id)],
        },
        unlocked,
    };
}

/* ---------------- 结算 ---------------- */

export type GameOutcome = {
    progress: Progress;
    xpGained: number;
    unlocked: BadgeDef[];
    isBest: boolean;
    starsGained: boolean;
};

/**
 * 把一局结果写进进度：最佳成绩、XP、今日计数、每日任务和徽章。
 * 纯函数；调用方负责把返回的 progress 交给 update()。
 */
export function recordGame(
    progress: Progress,
    gameId: string,
    result: GameResult,
): GameOutcome {
    const games = progress.games ?? {};
    const prev: GameProgress = games[gameId] ?? {
        plays: 0,
        best: 0,
        stars: 0,
        last: 0,
    };
    const nextGame: GameProgress = {
        plays: prev.plays + 1,
        best: Math.max(prev.best, result.score),
        stars: Math.max(prev.stars, result.stars) as GameProgress["stars"],
        last: Date.now(),
        bestCombo: Math.max(prev.bestCombo ?? 0, result.combo ?? 0),
    };

    let next: Progress = {
        ...progress,
        games: { ...games, [gameId]: nextGame },
        xp: (progress.xp ?? 0) + gameXp(result),
    };
    // bumpDaily 可能顺带发放每日全清奖励，所以 XP 差值要在它之后再算
    next = bumpDaily(next, { games: 1 });
    const evaluated = evaluateBadges(next);

    return {
        progress: evaluated.progress,
        xpGained: (evaluated.progress.xp ?? 0) - (progress.xp ?? 0),
        unlocked: evaluated.unlocked,
        isBest: result.score > prev.best,
        starsGained: nextGame.stars > prev.stars,
    };
}
