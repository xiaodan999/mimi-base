import { BANK } from "./bank";
import { CARDS, MODULES } from "./cards";
import { NURSING_QC_META } from "../../meta";
import type { StudySubject } from "../../types";

// 元数据（标题 / 图标 / 考试日期 / 数量）只维护在 meta.ts 一份；这里只补上
// 真正的题库、知识卡和模块内容。cardCount / bankCount 是元数据字段，
// 由展开语法带进来（展开属性不触发 TS 的多余属性检查），不会写进 StudySubject。
const nursingQc: StudySubject = {
    ...NURSING_QC_META,
    modules: MODULES,
    cards: CARDS,
    bank: BANK,
};

export default nursingQc;
