import { createFileRoute } from "@tanstack/react-router";

import StudyHub from "@/app/study/components/StudyHub";
import "@/app/study/study.css";

export const Route = createFileRoute("/_protected/_main/study/")({
    component: StudyHub,
});
