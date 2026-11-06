import type { StudySubject } from "./types";

/**
 * 科目内容加载器（懒加载）。
 *
 * 题库 bank.ts / 知识卡 cards.ts 共约 140KB CJK 字符串，只能通过这里的
 * 动态 import 进入 /study/$subjectId 路由 chunk，绝不静态打进 app shell。
 * 首页 / 年度报告 / 科目总览请改用 meta.ts 的 SUBJECT_META。
 *
 * 新增科目：在 meta.ts 加一份 SubjectMeta，再在 loadSubject 里加一个分支。
 */
export async function loadSubject(
    id: string | undefined,
): Promise<StudySubject | undefined> {
    if (id === "nursing-qc") {
        const module = await import("./subjects/nursing-qc");
        return module.default;
    }
    return undefined;
}

// 兼容旧引用：KIND_LABEL 现在放在零依赖的 meta.ts。
export { KIND_LABEL } from "./meta";
