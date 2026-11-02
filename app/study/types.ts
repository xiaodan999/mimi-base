/**
 * 学习基地的通用数据模型。
 *
 * 一个「科目」(StudySubject) 目前支持三种形态：
 * - quiz  题库 + 知识卡（护理质控就是这种）
 * - doc   纯文档阅读（预留）
 * - media 视频 / 音频（预留）
 *
 * 新增科目 = 在 app/study/subjects/ 下加一个目录并导出 StudySubject，
 * 再到 app/study/registry.ts 注册，不需要改路由和组件。
 */

export type Module = {
    id: string;
    name: string;
    icon: string;
    /** CSS 颜色，例如 "var(--m1)" */
    c: string;
    desc: string;
};

export type CardTable = {
    head: string[];
    rows: string[][];
    /** 每列宽度，例如 ["78%", "22%"]，缺省时等分 */
    w?: string[];
    note?: string;
};

export type CardSection = {
    h: string;
    items: string[];
};

export type Card = {
    id: string;
    /** 所属模块 id */
    m: string;
    t: string;
    /** 核心 / 高频 / 易错 / 必背 / 衍生 */
    tag: string;
    /** 动画演示 id，见 demos.ts */
    demo?: string | null;
    demoArg?: string | string[];
    points?: string[];
    table?: CardTable;
    sections?: CardSection[];
    memo?: string;
    trap?: string;
};

type BaseItem = {
    id: string;
    /** 所属模块 id */
    m: string;
    /** 所属知识卡 id；用于「做这张卡的题」按卡片抽题 */
    card?: string;
    stem: string;
    exp?: string;
};

export type SingleItem = BaseItem & {
    type: "single";
    o: string[];
    a: number;
};

export type MultiItem = BaseItem & {
    type: "multi";
    o: string[];
    a: number[];
};

export type BlankItem = BaseItem & {
    type: "blank";
    /** 每个空一个答案，`|` 分隔可接受的其他写法 */
    ans: string[];
};

export type TermItem = BaseItem & {
    type: "term";
    ans: string;
    keys: string[];
};

export type ShortItem = BaseItem & {
    type: "short";
    ans: string;
    keys: string[];
};

export type QuizItem =
    SingleItem | MultiItem | BlankItem | TermItem | ShortItem;

export type QuizType = QuizItem["type"];

/** 用户作答：单选是下标，多选是下标数组，其余是文本 */
export type Answer = number | number[] | string | undefined;

export type SubjectKind = "quiz" | "doc" | "media";

export type StudySubject = {
    id: string;
    title: string;
    subtitle: string;
    kind: SubjectKind;
    icon: string;
    /** 主题色（十六进制），用于科目卡片 */
    accent: string;
    /** 考试日期（ISO 字符串），有则显示倒计时 */
    examDate?: string;
    modules: Module[];
    cards: Card[];
    bank: QuizItem[];
};

/** 知识卡里互动演示的状态（存 study_progress.data.widgets） */
export type CardWidgetState = {
    /** 单值：滑杆刻度 / 计时分钟 / 总分等 */
    value?: number;
    /** 流程走到第几步（从 0 开始） */
    step?: number;
    /** 当前选中的选项 id */
    option?: string;
    /** 多选清单里已勾选的 id */
    checks?: string[];
    /** 多项评分：维度 id -> 分值 */
    vals?: Record<string, number>;
    /** 用户至少完整玩过一次 */
    done?: 1;
    updated?: number;
};

/** 一条学习进度（存 PocketBase 的 study_progress.data） */
export type Progress = {
    cards: Record<string, { seen?: 1; k?: 0 | 1 }>;
    stat: Record<string, { r: number; w: number }>;
    wrong: Record<string, { c: number; t: number }>;
    exams: { name: string; score: number; date: string; ts: number }[];
    terms: Record<string, { k?: number; flip?: number }>;
    days: string[];
    lastDay: string;
    widgets: Record<string, CardWidgetState>;
};

export function emptyProgress(): Progress {
    return {
        cards: {},
        stat: {},
        wrong: {},
        exams: [],
        terms: {},
        days: [],
        lastDay: "",
        widgets: {},
    };
}
