import {
    TYPE_NAME,
    answerText,
    cardStats,
    daysLeft,
    questionStats,
    streakDays,
} from "@/app/study/engine";
import type {
    Answer,
    Card,
    Progress,
    QuizItem,
    StudySubject,
} from "@/app/study/types";

import type { AiMessage } from "./client";
import { fenceUntrusted, systemPrompt } from "./prompt-base";

const SYSTEM = systemPrompt("学习搭子，擅长护理质控考试", "");

function stripHtml(value: string): string {
    return value
        .replace(/<br\s*\/?>/gi, "\n")
        .replace(/<[^>]+>/g, "")
        .replace(/\n{3,}/g, "\n\n")
        .trim();
}

function moduleName(subject: StudySubject, id: string): string {
    return subject.modules.find((mod) => mod.id === id)?.name ?? id;
}

function subjectBrief(subject: StudySubject): string {
    return [
        `科目：${subject.title}（${subject.subtitle}）`,
        `模块：${subject.modules.map((mod) => `${mod.id}=${mod.name}`).join("、")}`,
    ].join("\n");
}

export function cardToText(card: Card, modName?: string): string {
    const lines = [
        `模块：${modName ?? card.m}`,
        `标题：${card.t}`,
        `标签：${card.tag}`,
    ];
    if (card.points?.length) {
        lines.push(
            `要点：\n${card.points.map((point) => `- ${stripHtml(point)}`).join("\n")}`,
        );
    }
    if (card.table) {
        lines.push(`表格：${card.table.head.join(" | ")}`);
        card.table.rows.forEach((row) => {
            lines.push(`- ${row.map(stripHtml).join(" | ")}`);
        });
        if (card.table.note) {
            lines.push(`表格备注：${stripHtml(card.table.note)}`);
        }
    }
    card.sections?.forEach((section) => {
        lines.push(
            `${section.h}：\n${section.items
                .map((item) => `- ${stripHtml(item)}`)
                .join("\n")}`,
        );
    });
    if (card.memo) lines.push(`口诀：${stripHtml(card.memo)}`);
    if (card.trap) lines.push(`易错点：${stripHtml(card.trap)}`);
    return lines.join("\n");
}

export function itemToText(item: QuizItem, modName?: string): string {
    const lines = [
        `模块：${modName ?? item.m}`,
        `题型：${TYPE_NAME[item.type]}`,
        `题目：${item.stem}`,
    ];
    if ("o" in item) {
        lines.push(
            `选项：\n${item.o
                .map(
                    (option, index) =>
                        `${String.fromCharCode(65 + index)}. ${option}`,
                )
                .join("\n")}`,
        );
    }
    lines.push(`正确答案：${answerText(item)}`);
    if (item.exp) lines.push(`解析：${item.exp}`);
    if ("keys" in item && item.keys.length) {
        lines.push(`关键词：${item.keys.join("、")}`);
    }
    return lines.join("\n");
}

export function userAnswerText(item: QuizItem, answer: Answer): string {
    if (answer === undefined || answer === null) return "（未作答）";
    if (item.type === "single" || item.type === "multi") {
        const indexes = (Array.isArray(answer) ? answer : [answer]).filter(
            (value): value is number => typeof value === "number",
        );
        if (!indexes.length) return "（未作答）";
        return indexes
            .map(
                (index) =>
                    `${String.fromCharCode(65 + index)}. ${item.o[index] ?? ""}`,
            )
            .join("；");
    }
    return String(answer).trim() || "（未作答）";
}

function progressBrief(subject: StudySubject, progress: Progress): string {
    const cards = cardStats(subject, progress);
    const questions = questionStats(progress);
    const left = daysLeft(subject.examDate);
    const wrong = Object.keys(progress.wrong)
        .map((id) => subject.bank.find((item) => item.id === id))
        .filter((item): item is QuizItem => Boolean(item))
        .slice(0, 10)
        .map(
            (item) =>
                `- [${moduleName(subject, item.m)}] ${item.stem.slice(0, 50)}`,
        );
    const modules = subject.modules.map((mod) => {
        const bank = subject.bank.filter((item) => item.m === mod.id);
        let done = 0;
        let right = 0;
        bank.forEach((item) => {
            const stat = progress.stat[item.id];
            if (!stat) return;
            done += stat.r + stat.w;
            right += stat.r;
        });
        const modCards = subject.cards.filter((card) => card.m === mod.id);
        const known = modCards.filter(
            (card) => progress.cards[card.id]?.k,
        ).length;
        return `- ${mod.id}=${mod.name}：刷题 ${done} 次，正确率 ${
            done ? Math.round((right / done) * 100) : 0
        }%，卡 ${known}/${modCards.length}`;
    });
    const exams =
        progress.exams
            .slice(-3)
            .map((exam) => `${exam.name} ${exam.score} 分`)
            .join("；") || "暂无";

    return [
        `距考试：${left === null ? "未设置" : `${left} 天`}`,
        `连续学习：${streakDays(progress)} 天`,
        `已掌握卡：${cards.known}/${cards.total}`,
        `刷题：${questions.done} 次，正确率 ${questions.accuracy}%`,
        `最近模拟考：${exams}`,
        `模块情况：\n${modules.join("\n")}`,
        `最近错题：\n${wrong.length ? wrong.join("\n") : "暂无"}`,
    ].join("\n");
}

/* ---------------- 讲卡 ---------------- */

export function explainCardMessages(
    subject: StudySubject,
    card: Card,
    modName?: string,
): AiMessage[] {
    return [
        { role: "system", content: SYSTEM },
        {
            role: "user",
            content: `${subjectBrief(subject)}\n\n${cardToText(card, modName)}\n\n请把这张知识卡讲给我听，按下面四段，每段一两句话：\n1. 一句话本质：\n2. 生活里的比喻：\n3. 考试会怎么考：\n4. 最容易错的点：\n不要照抄原文，总字数 350 字以内。`,
        },
    ];
}

export const CARD_CHIPS = [
    {
        label: "再举个例子",
        prompt: "再举一个生活里的例子，最好是我每天都会遇到的场景。",
    },
    {
        label: "和易混点怎么区分",
        prompt: "这张卡最容易和哪个概念混？给我一个一眼就能区分的判断方法。",
    },
    {
        label: "出题人会怎么坑我",
        prompt: "如果出题人想在这张卡上坑我，会怎么设置干扰项？给我 2 个例子。",
    },
];

/* ---------------- 错题验尸 ---------------- */

export function diagnoseWrongMessages(
    subject: StudySubject,
    item: QuizItem,
    answer: Answer,
    modName?: string,
): AiMessage[] {
    return [
        { role: "system", content: SYSTEM },
        {
            role: "user",
            content: `${subjectBrief(subject)}\n\n${itemToText(item, modName)}\n\n${fenceUntrusted("学生选的答案", userAnswerText(item, answer))}\n\n请做一次「错题验尸」，分四段：\n1. 他为什么会选这个答案（推测误解）\n2. 正确思路是什么\n3. 下次看到什么信号要警惕\n4. 一句话记忆钩子\n如果学生没作答，就分析这道题最常见的误解。总字数 300 字以内。`,
        },
    ];
}

export const WRONG_CHIPS = [
    {
        label: "再出一道类似的",
        prompt: "基于这个考点，再出一道容易踩同样坑的单选题，先别给答案。",
    },
    {
        label: "我还是不懂",
        prompt: "换个更基础的说法再讲一遍，假设我完全没学过这个知识点。",
    },
];

/* ---------------- 简答批改 ---------------- */

export type AiGrade = {
    score: number;
    hit: string[];
    miss: string[];
    comment: string;
    modelAnswer: string;
};

export function gradeMessages(
    subject: StudySubject,
    item: QuizItem,
    answer: Answer,
    modName?: string,
): AiMessage[] {
    return [
        { role: "system", content: SYSTEM },
        {
            role: "user",
            content: `${subjectBrief(subject)}\n\n${itemToText(item, modName)}\n\n${fenceUntrusted("学生的作答", userAnswerText(item, answer))}\n\n请按考试踩分点批改，严格但别打击人。只输出 JSON，不要 markdown：\n{"score":0到100的整数,"hit":["答到的得分点"],"miss":["漏掉的得分点"],"comment":"两三句点评，先肯定再指出问题","modelAnswer":"一份能拿满分的参考答案"}`,
        },
    ];
}

/* ---------------- 变式题 ---------------- */

export type AiVariantPayload = {
    items: {
        type: "single" | "multi";
        stem: string;
        options: string[];
        answer: number | number[] | string;
        exp: string;
    }[];
};

export function variantMessages(
    subject: StudySubject,
    item: QuizItem,
    modName?: string,
): AiMessage[] {
    return [
        { role: "system", content: SYSTEM },
        {
            role: "user",
            content: `${subjectBrief(subject)}\n\n${itemToText(item, modName)}\n\n基于这道题，生成 3 道同考点的变式题。要求：换情境、换问法、换干扰项，不要和原题一模一样。只输出 JSON：\n{"items":[{"type":"single","stem":"...","options":["选项内容1","选项内容2","选项内容3","选项内容4"],"answer":0,"exp":"..."}]}\ntype 只能是 single 或 multi；multi 的 answer 是下标数组；options 必须 4 个，只写内容不要带 A/B/C/D 前缀；answer 必须在范围内。`,
        },
    ];
}

/* ---------------- 今日计划 ---------------- */

export type AiPlan = {
    greeting: string;
    focus: string;
    minutes: number;
    tasks: {
        title: string;
        why: string;
        section: string;
        module?: string;
    }[];
    tip: string;
};

export function planMessages(
    subject: StudySubject,
    progress: Progress,
    minutes: number,
): AiMessage[] {
    return [
        { role: "system", content: SYSTEM },
        {
            role: "user",
            content: `${subjectBrief(subject)}\n\n${progressBrief(subject, progress)}\n\n请安排今天 ${minutes} 分钟的学习计划。只输出 JSON：\n{"greeting":"一句开场","focus":"今天的重点","minutes":${minutes},"tasks":[{"title":"任务","why":"为什么做","section":"cards|quiz|exam|terms|wrong|memo|games","module":"模块 id，没有就空字符串"}],"tip":"一句提醒"}\n3 到 5 个任务，按优先级排，必须能在 ${minutes} 分钟内完成；section 只能从给定值里选，module 必须是上面出现过的模块 id。`,
        },
    ];
}

/* ---------------- 周报 ---------------- */

export function weeklyMessages(
    subject: StudySubject,
    progress: Progress,
): AiMessage[] {
    return [
        { role: "system", content: SYSTEM },
        {
            role: "user",
            content: `${subjectBrief(subject)}\n\n${progressBrief(subject, progress)}\n\n请用学习搭子的口吻写一份本周学习周报：\n- 先给一句有情绪的总结\n- 指出 1-2 个真实薄弱点（引用上面的数据，不要编）\n- 给下周 3 条具体可执行的建议\n用 markdown 小标题和列表，400 字以内。`,
        },
    ];
}

export const WEEKLY_CHIPS = [
    {
        label: "给我下周的安排",
        prompt: "把下周 7 天排成一个具体计划，每天 20 分钟左右。",
    },
    {
        label: "我最大的问题是什么",
        prompt: "只看数据，指出我最该优先解决的一个问题，并给一个今天就能做的动作。",
    },
];

/** 周报按自然周缓存（周一开始） */
export function weekKey(date = new Date()): string {
    const copy = new Date(date);
    const day = copy.getDay() || 7;
    copy.setDate(copy.getDate() - day + 1);
    return `${copy.getFullYear()}-${copy.getMonth() + 1}-${copy.getDate()}`;
}
