import nursingQc from "./subjects/nursing-qc";
import type { StudySubject } from "./types";

/**
 * 学习基地的科目注册表。
 * 新增科目：在 app/study/subjects/ 下建目录并导出 StudySubject，
 * 然后加到这个数组里即可，路由和界面会自动带出来。
 */
export const SUBJECTS: StudySubject[] = [nursingQc];

export function getSubject(id: string | undefined): StudySubject | undefined {
    if (!id) return undefined;
    return SUBJECTS.find((subject) => subject.id === id);
}

export const KIND_LABEL: Record<StudySubject["kind"], string> = {
    quiz: "题库 · 知识卡",
    doc: "文档阅读",
    media: "视频 · 音频",
};
