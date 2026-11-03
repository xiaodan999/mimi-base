import type {
    Answer,
    DailyStats,
    Progress,
    QuizItem,
    QuizType,
    StudySubject,
} from "./types";

/** 去掉空白与标点，用于填空题的宽松比对 */
export function norm(input: unknown): string {
    return String(input ?? "")
        .toLowerCase()
        .replace(/[\s\u3000]/g, "")
        .replace(/[，。、；：？！（）【】“”‘’·,;:?!"'()[\]<>《》\-—_~～]/g, "")
        .replace(/[０-９]/g, (c) =>
            String.fromCharCode(c.charCodeAt(0) - 0xfee0),
        )
        .replace(/[Ａ-Ｚａ-ｚ]/g, (c) =>
            String.fromCharCode(c.charCodeAt(0) - 0xfee0),
        );
}

function isNumberLike(value: string): boolean {
    return /^-?\d+(\.\d+)?$/.test(value.trim());
}

/**
 * 填空题判分：完全一致、数值相等、或答案被包含都算对。
 * `|` 分隔同一个空的多种可接受写法。
 */
export function blankOK(user: string, list: string[]): boolean {
    const raw = String(user ?? "").trim();
    if (!raw) return false;
    const target = norm(raw);
    for (const item of list ?? []) {
        for (const alt of String(item).split("|")) {
            const candidate = norm(alt);
            if (!candidate) continue;
            if (target === candidate) return true;
            if (
                isNumberLike(raw) &&
                isNumberLike(alt) &&
                Math.abs(parseFloat(raw) - parseFloat(alt)) < 1e-9
            ) {
                return true;
            }
            if (target.length >= 2 && target.includes(candidate)) return true;
            if (target.length >= 3 && candidate.includes(target)) return true;
        }
    }
    return false;
}

/** 简答/名词解释命中到的关键词 */
export function kwHit(text: string, keys: string[]): string[] {
    const target = norm(text);
    if (!target) return [];
    return (keys ?? []).filter((key) => target.includes(norm(key)));
}

export function keywordRatio(text: string, keys: string[]): number {
    if (!keys?.length) return 0;
    return kwHit(text, keys).length / keys.length;
}

export function shuffle<T>(list: readonly T[]): T[] {
    const out = list.slice();
    for (let i = out.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
}

export function fmtTime(seconds: number): string {
    const safe = Math.max(0, Math.floor(seconds));
    const m = Math.floor(safe / 60);
    const s = safe % 60;
    return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

/** 客观题自动判分（名解/简答在练习模式由用户自评，模拟考按关键词判） */
export function isAnswerCorrect(item: QuizItem, answer: Answer): boolean {
    switch (item.type) {
        case "single":
            return answer === item.a;
        case "multi":
            return (
                Array.isArray(answer) &&
                answer.length > 0 &&
                [...answer].sort().join() === [...item.a].sort().join()
            );
        case "blank":
            return blankOK(String(answer ?? ""), item.ans);
        case "short":
        case "term":
            return keywordRatio(String(answer ?? ""), item.keys) >= 0.5;
    }
}

export function answerText(item: QuizItem): string {
    switch (item.type) {
        case "single":
            return `${String.fromCharCode(65 + item.a)}. ${item.o[item.a]}`;
        case "multi":
            return (
                item.a.map((i) => String.fromCharCode(65 + i)).join("、") +
                " — " +
                item.a.map((i) => item.o[i]).join("；")
            );
        case "blank":
            return item.ans.join(" / ");
        default:
            return item.ans;
    }
}

export const TYPE_NAME: Record<QuizType, string> = {
    term: "名词解释",
    single: "单选题",
    multi: "多选题",
    blank: "填空题",
    short: "简答题",
};

export const TYPE_ICON: Record<QuizType, string> = {
    term: "📖",
    single: "🔘",
    multi: "☑️",
    blank: "✍️",
    short: "📝",
};

/* ---------------- 模拟考 ---------------- */

export type ExamPreset = {
    key: string;
    name: string;
    minutes: number;
    desc: string;
    counts: Partial<Record<QuizType, number>>;
};

export const EXAM_PRESETS: ExamPreset[] = [
    {
        key: "quick",
        name: "快速卷",
        minutes: 20,
        desc: "20 分钟 · 20 题",
        counts: { term: 2, single: 10, multi: 3, blank: 3, short: 2 },
    },
    {
        key: "std",
        name: "标准卷",
        minutes: 45,
        desc: "45 分钟 · 38 题",
        counts: { term: 5, single: 20, multi: 5, blank: 5, short: 3 },
    },
    {
        key: "full",
        name: "全真卷",
        minutes: 90,
        desc: "90 分钟 · 68 题",
        counts: { term: 8, single: 35, multi: 10, blank: 10, short: 5 },
    },
];

export const POINTS: Record<QuizType, number> = {
    term: 4,
    single: 2,
    multi: 4,
    blank: 2,
    short: 8,
};

export function findPreset(key: string): ExamPreset {
    return EXAM_PRESETS.find((p) => p.key === key) ?? EXAM_PRESETS[0];
}

export function buildExam(
    subject: StudySubject,
    preset: ExamPreset,
): QuizItem[] {
    const items: QuizItem[] = [];
    for (const [type, count] of Object.entries(preset.counts)) {
        const pool = shuffle(
            subject.bank.filter((q) => q.type === (type as QuizType)),
        );
        items.push(...pool.slice(0, count ?? 0));
    }
    return shuffle(items);
}

export type ExamResult = {
    score: number;
    raw: number;
    max: number;
    detail: boolean[];
    byType: Record<string, { n: number; ok: number }>;
};

export function scoreExam(items: QuizItem[], answers: Answer[]): ExamResult {
    let raw = 0;
    let max = 0;
    const detail: boolean[] = [];
    const byType: Record<string, { n: number; ok: number }> = {};

    items.forEach((item, index) => {
        const points = POINTS[item.type];
        max += points;
        const ok = isAnswerCorrect(item, answers[index]);
        if (ok) raw += points;
        detail.push(ok);
        const bucket = (byType[item.type] ??= { n: 0, ok: 0 });
        bucket.n += 1;
        if (ok) bucket.ok += 1;
    });

    return {
        score: max === 0 ? 0 : Math.round((raw / max) * 100),
        raw,
        max,
        detail,
        byType,
    };
}

/* ---------------- 进度统计 ---------------- */

export function dayKey(date = new Date()): string {
    return `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
}

export function touchDay(progress: Progress): Progress {
    const key = dayKey();
    const days = progress.days.includes(key)
        ? progress.days
        : [...progress.days, key].slice(-400);
    return { ...progress, days, lastDay: key };
}

/* ---------------- 每日任务 ---------------- */

export const DAILY_TASKS = [
    { id: "games", label: "完成 1 局实战", target: 1, unit: "局" },
    { id: "questions", label: "答 10 道题", target: 10, unit: "题" },
    { id: "cards", label: "看 1 张知识卡", target: 1, unit: "张" },
] as const;

export type DailyTask = (typeof DAILY_TASKS)[number];
export type DailyTaskStatus = DailyTask & { n: number; done: boolean };

/** 每日任务全清奖励 */
export const DAILY_BONUS_XP = 30;

/** 取今天的计数；跨天时返回一份归零的副本 */
export function dailyToday(progress: Progress): DailyStats {
    const today = dayKey();
    if (progress.daily?.date === today) return progress.daily;
    return { date: today, questions: 0, correct: 0, cards: 0, games: 0 };
}

export function dailyTaskStatus(progress: Progress): DailyTaskStatus[] {
    const daily = dailyToday(progress);
    return DAILY_TASKS.map((task) => {
        const n = daily[task.id];
        return { ...task, n, done: n >= task.target };
    });
}

/** 三个任务都完成时，当天只发一次 30 XP */
export function settleDailyQuest(progress: Progress): Progress {
    const daily = dailyToday(progress);
    const done = DAILY_TASKS.every((task) => daily[task.id] >= task.target);
    if (!done) return progress;
    if (progress.quest?.date === daily.date && progress.quest.awarded) {
        return progress;
    }
    return {
        ...progress,
        xp: (progress.xp ?? 0) + DAILY_BONUS_XP,
        quest: { date: daily.date, awarded: 1 },
    };
}

/**
 * 记录当天的一次学习行为，并顺带结算每日任务。
 * 所有计数都先按今天归一化，所以跨天不需要额外清理。
 */
export function bumpDaily(
    progress: Progress,
    patch: Partial<Omit<DailyStats, "date">>,
): Progress {
    const daily = dailyToday(progress);
    const nextDaily: DailyStats = { ...daily };
    for (const key of ["questions", "correct", "cards", "games"] as const) {
        if (patch[key] === undefined) continue;
        nextDaily[key] = Math.max(0, (daily[key] ?? 0) + patch[key]!);
    }
    const next: Progress = {
        ...progress,
        daily: nextDaily,
        quest:
            progress.quest?.date === daily.date
                ? progress.quest
                : { date: daily.date },
    };
    return settleDailyQuest(touchDay(next));
}

export function streakDays(progress: Progress): number {
    if (!progress.days.length) return 0;
    const set = new Set(progress.days);
    const cursor = new Date();
    let count = 0;
    for (let i = 0; i < 400; i++) {
        const key = dayKey(cursor);
        if (set.has(key)) {
            count += 1;
            cursor.setDate(cursor.getDate() - 1);
        } else if (i === 0) {
            cursor.setDate(cursor.getDate() - 1);
        } else {
            break;
        }
    }
    return count;
}

export function questionStats(progress: Progress) {
    let done = 0;
    let right = 0;
    for (const stat of Object.values(progress.stat)) {
        done += stat.r + stat.w;
        right += stat.r;
    }
    return {
        done,
        right,
        accuracy: done ? Math.round((right / done) * 100) : 0,
    };
}

export function cardStats(subject: StudySubject, progress: Progress) {
    const total = subject.cards.length;
    const known = subject.cards.filter((c) => progress.cards[c.id]?.k).length;
    const seen = subject.cards.filter((c) => progress.cards[c.id]?.seen).length;
    const played = subject.cards.filter(
        (c) => progress.widgets?.[c.id]?.done,
    ).length;
    return {
        total,
        known,
        seen,
        played,
        percent: total ? Math.round((known / total) * 100) : 0,
        playedPercent: total ? Math.round((played / total) * 100) : 0,
    };
}

export function daysLeft(examDate?: string): number | null {
    if (!examDate) return null;
    const target = new Date(examDate).getTime();
    if (Number.isNaN(target)) return null;
    return Math.max(0, Math.ceil((target - Date.now()) / 86400000));
}
