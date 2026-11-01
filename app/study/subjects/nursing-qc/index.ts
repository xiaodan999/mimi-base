import { BANK } from "./bank";
import { CARDS, MODULES } from "./cards";
import type { StudySubject } from "../../types";

const nursingQc: StudySubject = {
    id: "nursing-qc",
    title: "护理质控",
    subtitle: "全院考试 · 患者安全与护理质量",
    kind: "quiz",
    icon: "🩺",
    accent: "#0d9488",
    examDate: "2026-11-12T09:00:00+08:00",
    modules: MODULES,
    cards: CARDS,
    bank: BANK,
};

export default nursingQc;
