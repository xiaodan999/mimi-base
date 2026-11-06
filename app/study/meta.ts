/**
 * 学习基地的「元数据」：首页入口、年度报告、科目总览只需要 id / 标题 /
 * 图标 / 数量，不需要真正的题库和知识卡内容。
 *
 * 这个模块绝不能 import bank.ts / cards.ts / subjects/*：那会把约 140KB 的
 * CJK 题库静态打进登录后第一屏。题库只允许通过 registry.ts 的
 * loadSubject() 动态 import 进入 /study/* 路由 chunk。
 *
 * CI 断言（工作流文件由另一个分支维护，本分支不改 .github/workflows/*）：
 * 构建后应检查首页 chunk 不含题库文本，例如
 *   ! grep -q "危急值" build/assets/<home chunk>.js
 * 只要 SUBJECT_META 保持「零题库 import」，这条断言就会一直通过。
 */
import type { SubjectKind } from "./types";

export type SubjectMeta = {
    id: string;
    title: string;
    subtitle: string;
    kind: SubjectKind;
    icon: string;
    /** 主题色（十六进制），用于科目卡片 */
    accent: string;
    /** 考试日期（ISO 字符串），有则显示倒计时 */
    examDate?: string;
    /** 知识卡数量（与 cards.ts 的 CARDS.length 保持一致） */
    cardCount: number;
    /** 题目数量（与 bank.ts 的 BANK.length 保持一致） */
    bankCount: number;
};

/**
 * 唯一一份科目元数据，供 app shell 与科目内容共用。
 * 数量字段是字面量，app/study/validate.test.ts 会在构建/测试时对齐真实数据。
 */
export const NURSING_QC_META: SubjectMeta = {
    id: "nursing-qc",
    title: "护理质控",
    subtitle: "全院考试 · 患者安全与护理质量",
    kind: "quiz",
    icon: "🩺",
    accent: "#0d9488",
    examDate: "2026-11-12T09:00:00+08:00",
    cardCount: 45,
    bankCount: 215,
};

export const SUBJECT_META: SubjectMeta[] = [NURSING_QC_META];

export function getSubjectMeta(
    id: string | undefined,
): SubjectMeta | undefined {
    if (!id) return undefined;
    return SUBJECT_META.find((subject) => subject.id === id);
}

export const KIND_LABEL: Record<SubjectKind, string> = {
    quiz: "题库 · 知识卡",
    doc: "文档阅读",
    media: "视频 · 音频",
};
