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

/**
 * 墓碑只留最新的 500 条（按次数裁剪，不按时间：合并结果不该依赖本机时钟）。
 * 个人题库远到不了这个量，够跨设备传播，也不会让 Progress 无限增长。
 */
const WRONG_TOMBSTONE_MAX = 500;

function pruneTombstones(
    tombstones: Progress["wrongDeleted"],
): Progress["wrongDeleted"] {
    const kept = Object.entries(tombstones)
        .filter(([, ts]) => Number.isFinite(ts))
        .sort((a, b) => b[1] - a[1])
        .slice(0, WRONG_TOMBSTONE_MAX);
    return Object.fromEntries(kept);
}

/** 墓碑取并集，同一道题取更晚的删除时间。 */
function mergeWrongDeleted(
    server: Progress["wrongDeleted"],
    local: Progress["wrongDeleted"],
): Progress["wrongDeleted"] {
    const out = { ...server };
    for (const [id, ts] of Object.entries(local)) {
        if (!Number.isFinite(ts)) continue;
        out[id] = Math.max(out[id] ?? 0, ts);
    }
    return pruneTombstones(out);
}

/**
 * 错题本按 id 合并：本地优先（答对会删掉条目），服务端独有的 key 保留
 * （另一台设备刚答错的题不能被这台设备的旧快照抹掉）。
 *
 * 删除靠墓碑表达：只有「删除时间晚于这道题最后一次答错」时才真正移除；
 * 反过来说明它后来又答错了，条目要留下。
 */
function mergeWrong(
    server: Progress["wrong"],
    local: Progress["wrong"],
    tombstones: Progress["wrongDeleted"],
): Progress["wrong"] {
    const out = { ...server, ...local };
    for (const [id, entry] of Object.entries(out)) {
        if ((tombstones[id] ?? 0) >= entry.t) delete out[id];
    }
    return out;
}

/**
 * 间隔重复以本地为准：本地快照是「服务端状态 + 这次作答」，答错会把 due
 * 提前；按 due 取较大值反而会把这次失败丢掉（lapses 也永远不涨）。
 * 服务端独有的 key 仍然保留。
 */
function mergeSrs(
    server: Record<string, SrsItem>,
    local: Record<string, SrsItem>,
): Record<string, SrsItem> {
    return { ...server, ...local };
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
    const wrongDeleted = mergeWrongDeleted(s.wrongDeleted, l.wrongDeleted);

    return {
        cards: mergeCards(s.cards, l.cards),
        stat: mergeStat(s.stat, l.stat),
        wrong: mergeWrong(s.wrong, l.wrong, wrongDeleted),
        wrongDeleted,
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
