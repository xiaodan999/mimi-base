import type { Progress } from "../types";

/** 实战小游戏的元数据；hub 的楼层图和列表都从这里读 */
export type GameStatus = "ready" | "soon" | "boss";

export type GameMeta = {
    id: string;
    title: string;
    subtitle: string;
    icon: string;
    /** 医院楼层图上的房间名 */
    room: string;
    accent: string;
    minutes: number;
    status: GameStatus;
    desc: string;
    /** 房间在等距地图上的格子坐标 */
    grid: [number, number];
    /** 这局实战覆盖的模块，用于「薄弱模块 → 去实战」推荐 */
    modules: string[];
    /** 这局实战用到的知识卡，用于游戏 ↔ 卡片双向链接 */
    cards: string[];
    /** boss 解锁条件；没有就默认开放 */
    unlock?: { gameId: string; stars: number }[];
};

export const GAMES: GameMeta[] = [
    {
        id: "ward-hazard",
        title: "夜巡",
        subtitle: "3D 病房找隐患",
        icon: "🔎",
        room: "病房",
        accent: "#38bdf8",
        minutes: 3,
        status: "ready",
        desc: "转一圈病房，找出 8 处会伤害患者的安全隐患，并亲手改掉它。",
        grid: [0, 0],
        modules: ["m1", "m2", "m3", "m4", "m5", "m6"],
        cards: [
            "c01",
            "c03",
            "c04",
            "c07",
            "c08",
            "c09",
            "c16",
            "c19",
            "c20",
            "c21",
            "c22",
            "c25",
            "c26",
            "c29",
            "c32",
            "c34",
        ],
    },
    {
        id: "blood-room",
        title: "输血密室",
        subtitle: "七道关卡的用血安全",
        icon: "🩸",
        room: "输血室",
        accent: "#fb7185",
        minutes: 5,
        status: "ready",
        desc: "从采血到血袋回收，七道门锁住一条命。错一步就是一次 near miss。",
        grid: [1, 0],
        modules: ["m3"],
        cards: ["c25", "c26", "c27"],
    },
    {
        id: "defib",
        title: "除颤时刻",
        subtitle: "导联定位 + CPR 节奏",
        icon: "⚡",
        room: "抢救室",
        accent: "#fbbf24",
        minutes: 4,
        status: "ready",
        desc: "在可旋转的 3D 身体上贴五色导联和除颤电极，再按 110 次/分按压。",
        grid: [2, 0],
        modules: ["m6"],
        cards: ["c38", "c39"],
    },
    {
        id: "skin",
        title: "皮肤之下",
        subtitle: "3D 压疮分层与分期",
        icon: "🔬",
        room: "皮肤科",
        accent: "#a78bfa",
        minutes: 5,
        status: "ready",
        desc: "切开一块 3D 皮肤，看到皮下脂肪、肌肉和骨面，再判断压疮分期。",
        grid: [0, 1],
        modules: ["m2"],
        cards: ["c11", "c13"],
    },
    {
        id: "shift",
        title: "20:00 夜班",
        subtitle: "综合病例 boss 战",
        icon: "🌙",
        room: "护士站",
        accent: "#34d399",
        minutes: 8,
        status: "boss",
        desc: "输血反应、危急值、跌倒、火灾同时发生。你只有一双手，先救谁？",
        grid: [1, 1],
        modules: ["m1", "m2", "m3", "m5", "m6"],
        cards: ["c03", "c04", "c08", "c25", "c26", "c31"],
        unlock: [
            { gameId: "ward-hazard", stars: 2 },
            { gameId: "blood-room", stars: 2 },
        ],
    },
];

export function getGame(id: string | undefined): GameMeta | undefined {
    return GAMES.find((game) => game.id === id);
}

export function readyGames(): GameMeta[] {
    return GAMES.filter((game) => game.status === "ready");
}

/** 卡片详情里的「去实战」：优先开放中的专属游戏，最后才推荐 boss */
export function gameForCard(cardId: string): GameMeta | undefined {
    const matches = GAMES.filter((game) => game.cards.includes(cardId));
    return (
        matches
            .filter((game) => game.status === "ready")
            .sort((a, b) => a.cards.length - b.cards.length)[0] ??
        matches
            .filter((game) => game.status === "boss")
            .sort((a, b) => a.cards.length - b.cards.length)[0]
    );
}

/** 薄弱模块推荐：优先开放的专属游戏，其次综合游戏 */
export function gameForModule(moduleId: string): GameMeta | undefined {
    const matches = GAMES.filter((game) => game.modules.includes(moduleId));
    return (
        matches
            .filter((game) => game.status === "ready")
            .sort(
                (a, b) =>
                    a.modules.length - b.modules.length ||
                    a.cards.length - b.cards.length,
            )[0] ??
        matches
            .filter((game) => game.status === "boss")
            .sort(
                (a, b) =>
                    a.modules.length - b.modules.length ||
                    a.cards.length - b.cards.length,
            )[0]
    );
}

export function isGameUnlocked(game: GameMeta, progress: Progress): boolean {
    if (game.status === "soon") return false;
    if (!game.unlock?.length) return true;
    return game.unlock.every(
        (requirement) =>
            (progress.games?.[requirement.gameId]?.stars ?? 0) >=
            requirement.stars,
    );
}

export function unlockText(game: GameMeta): string {
    if (!game.unlock?.length) return "";
    return game.unlock
        .map((item) => {
            const required = getGame(item.gameId);
            return `${required?.title ?? item.gameId} ${item.stars} 星`;
        })
        .join(" + ");
}
