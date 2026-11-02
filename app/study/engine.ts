import type {
    Answer,
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
