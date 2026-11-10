import { createFileRoute, Outlet } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";

import { StudyProvider } from "@/app/study/components/StudyContext";
import StudyShell from "@/app/study/components/StudyShell";
import { loadSubject } from "@/app/study/registry";

// 完整的 study.css 由 StudyShell.tsx（本路由的 lazy 布局）引入，避免被
// routeTree 静态提升进首屏 CSS；app shell 只需要 ai-tokens.css 那一小份。

export const Route = createFileRoute("/_protected/_main/study/$subjectId")({
    // 题库 / 知识卡（约 140KB CJK）走动态 import，只有真正进入某个科目时才
    // 下载；首页、年度报告、科目总览都读 meta.ts，不会碰到这份内容。
    loader: async ({ params }) => {
        const subject = await loadSubject(params.subjectId);
        return { subject };
    },
    pendingComponent: SubjectLoading,
    component: Layout,
});

function SubjectLoading() {
    // 这里只能用 Tailwind：study.css / games.css 跟着 StudyShell 和游戏 chunk
    // 懒加载，pending 阶段它们还没到，用 .game-loading 会渲染成没有样式的文字。
    return (
        <div className="flex min-h-[60vh] flex-col items-center justify-center gap-2 px-6 text-center text-muted-foreground">
            <Loader2
                className="size-6 animate-spin text-primary"
                aria-hidden="true"
            />
            <b className="text-sm font-bold">正在加载题库…</b>
            <span className="text-xs">
                第一次进入要下载知识卡，之后会快很多
            </span>
        </div>
    );
}

function Layout() {
    const { subject } = Route.useLoaderData();

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
