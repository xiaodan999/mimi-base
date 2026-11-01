import { Outlet, createFileRoute } from "@tanstack/react-router";

import { StudyProvider } from "@/app/study/components/StudyContext";
import StudyShell from "@/app/study/components/StudyShell";
import { getSubject } from "@/app/study/registry";
import "@/app/study/study.css";

export const Route = createFileRoute("/_protected/_main/study/$subjectId")({
    component: Layout,
});

function Layout() {
    const { subjectId } = Route.useParams();
    const subject = getSubject(subjectId);

    if (!subject) {
        return (
            <div className="p-6 text-center">
                <div className="text-lg font-bold">找不到这个科目</div>
                <div className="mt-1 text-sm text-muted-foreground">
                    它可能还没注册，或者链接已经失效。
                </div>
            </div>
        );
    }

    return (
        <StudyProvider subject={subject}>
            <StudyShell subject={subject}>
                <Outlet />
            </StudyShell>
        </StudyProvider>
    );
}
