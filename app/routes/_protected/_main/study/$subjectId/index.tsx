import { createFileRoute } from "@tanstack/react-router";

import SubjectHome from "@/app/study/components/SubjectHome";

export const Route = createFileRoute("/_protected/_main/study/$subjectId/")({
    component: SubjectHome,
});
