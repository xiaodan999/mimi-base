/**
 * 学习进度的合并逻辑（纯函数，可单测）。
 *
 * 服务端为准 + 合并写入：每次落库前把服务端快照与本地快照合并，避免两个
 * 标签页 / 设备用整份快照互相覆盖。
 *
 * 合并原则：
 *  - 只增不减的统计量（xp、stat、答题天数、徽章、考试记录…）取并集 / 较大值；
 *  - 会「删除」的每题状态（wrong、srs）以本地为准 —— 本地答对后会删掉错题，
 *    不能被服务端的旧快照复活；
 *  - cards / widgets / games 按 key 合并，本地优先，服务端独有的 key 保留。
 */
import type {
    CardWidgetState,
    DailyStats,
    GameProgress,
    Progress,
    QuestState,
    SrsItem,
} from "./types";
import { emptyProgress } from "./types";

/** 旧记录可能缺字段（例如没有 srs），补齐默认值，避免 undefined 扩散。 */
export function normalizeProgress(
    data: Partial<Progress> | null | undefined,
): Progress {
    return { ...emptyProgress(), ...(data ?? {}) };
}

/** dayKey() 用的是非补零的 Y-M-D，不能直接按字符串比大小。 */
function dayNum(key: string): number {
    const [y, m, d] = key.split("-").map(Number);
    return (y || 0) * 10000 + (m || 0) * 100 + (d || 0);
}

function mergeStat(
    server: Progress["stat"],
    local: Progress["stat"],
): Progress["stat"] {
    const out = { ...server };
    for (const [id, value] of Object.entries(local)) {
        const base = out[id];
        out[id] = base
            ? { r: Math.max(base.r, value.r), w: Math.max(base.w, value.w) }
            : value;
    }
    return out;
}

function mergeTerms(
    server: Progress["terms"],
    local: Progress["terms"],
): Progress["terms"] {
    const out = { ...server };
    for (const [id, value] of Object.entries(local)) {
        const base = out[id];
        out[id] = base
            ? {
                  k: Math.max(base.k ?? 0, value.k ?? 0),
                  flip: Math.max(base.flip ?? 0, value.flip ?? 0),
              }
            : value;
    }
    return out;
}

/** 掌握状态可以取消，所以本地值直接覆盖，服务端独有 key 保留。 */
function mergeCards(
    server: Progress["cards"],
    local: Progress["cards"],
): Progress["cards"] {
    return { ...server, ...local };
}

/** 错题本以本地为准：答对会删除，不能被旧快照复活。 */
function mergeWrong(
    _server: Progress["wrong"],
    local: Progress["wrong"],
): Progress["wrong"] {
    return { ...local };
}

/** 间隔重复排程以「更新到更晚」的一条为准。 */
function mergeSrs(
    server: Record<string, SrsItem>,
    local: Record<string, SrsItem>,
): Record<string, SrsItem> {
    const out = { ...server };
    for (const [id, value] of Object.entries(local)) {
        const base = out[id];
        if (!base || value.due >= base.due) out[id] = value;
    }
    return out;
}

function mergeExams(
    server: Progress["exams"],
    local: Progress["exams"],
): Progress["exams"] {
    const seen = new Set(
        server.map((exam) => `${exam.name}:${exam.date}:${exam.ts}`),
    );
    const out = server.slice();
    for (const exam of local) {
        const key = `${exam.name}:${exam.date}:${exam.ts}`;
        if (!seen.has(key)) {
            seen.add(key);
            out.push(exam);
        }
    }
    return out;
}

function mergeWidgets(
    server: Record<string, CardWidgetState>,
    local: Record<string, CardWidgetState>,
): Record<string, CardWidgetState> {
    const out = { ...server };
    for (const [id, value] of Object.entries(local)) {
        const base = out[id];
        if (!base || (value.updated ?? 0) >= (base.updated ?? 0)) {
            out[id] = value;
        }
    }
    return out;
}

function mergeGames(
    server: Record<string, GameProgress>,
    local: Record<string, GameProgress>,
): Record<string, GameProgress> {
    const out = { ...server };
    for (const [id, value] of Object.entries(local)) {
        const base = out[id];
        if (!base) {
            out[id] = value;
            continue;
        }
        const bestCombo = Math.max(base.bestCombo ?? 0, value.bestCombo ?? 0);
        out[id] = {
            plays: Math.max(base.plays, value.plays),
            best: Math.max(base.best, value.best),
            stars: Math.max(base.stars, value.stars) as GameProgress["stars"],
            last: Math.max(base.last, value.last),
            ...(bestCombo ? { bestCombo } : {}),
        };
    }
    return out;
}

function mergeDaily(server: DailyStats, local: DailyStats): DailyStats {
    if (server.date !== local.date) return local;
    return {
        date: local.date,
        questions: Math.max(server.questions, local.questions),
        correct: Math.max(server.correct, local.correct),
        cards: Math.max(server.cards, local.cards),
        games: Math.max(server.games, local.games),
    };
}

function mergeQuest(server: QuestState, local: QuestState): QuestState {
    if (server.date !== local.date) return local;
    return {
        date: local.date,
        ...(server.awarded || local.awarded ? { awarded: 1 as const } : {}),
    };
}

export function mergeProgress(
    server: Partial<Progress> | null | undefined,
    local: Partial<Progress> | null | undefined,
): Progress {
    const s = normalizeProgress(server);
    const l = normalizeProgress(local);

    return {
        cards: mergeCards(s.cards, l.cards),
        stat: mergeStat(s.stat, l.stat),
        wrong: mergeWrong(s.wrong, l.wrong),
        exams: mergeExams(s.exams, l.exams),
        terms: mergeTerms(s.terms, l.terms),
        days: [...new Set([...s.days, ...l.days])].slice(-400),
        lastDay: dayNum(s.lastDay) >= dayNum(l.lastDay) ? s.lastDay : l.lastDay,
        widgets: mergeWidgets(s.widgets, l.widgets),
        games: mergeGames(s.games, l.games),
        xp: Math.max(s.xp, l.xp),
        badges: [...new Set([...s.badges, ...l.badges])],
        daily: mergeDaily(s.daily, l.daily),
        quest: mergeQuest(s.quest, l.quest),
        srs: mergeSrs(s.srs, l.srs),
    };
}
