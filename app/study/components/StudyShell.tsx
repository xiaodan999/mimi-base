import { Link, useLocation } from "@tanstack/react-router";
import type { ReactNode } from "react";

// 完整的 study.css 跟着 /study/$subjectId 的 lazy 布局一起加载。
// app shell 只引入 ai-tokens.css 的精简 token，不再把这份 60KB 样式带给每页。
import "@/app/study/study.css";

import PageHeader from "@/components/PageHeader";

import type { StudySubject } from "../types";
import { useStudy } from "./StudyContext";

const TABS = [
    { key: "home", label: "首页" },
    { key: "cards", label: "知识卡" },
    { key: "quiz", label: "刷题" },
    { key: "games", label: "实战" },
    { key: "exam", label: "模拟考" },
    { key: "terms", label: "背名解" },
    { key: "wrong", label: "错题" },
] as const;

export default function StudyShell({
    subject,
    children,
}: {
    subject: StudySubject;
    children: ReactNode;
}) {
    const { saving, error, offline } = useStudy();
    const { pathname } = useLocation();
    const base = `/study/${subject.id}`;

    return (
        <div className="study-root study-shell">
            <div className="mx-auto w-full max-w-md px-4 pt-[calc(1rem+env(safe-area-inset-top))] pb-1">
                <PageHeader
                    backTo="/study"
                    backLabel="返回学习基地"
                    title={`${subject.icon} ${subject.title}`}
                    description={subject.subtitle}
                    actions={
                        <span
                            className="shrink-0 text-[11px] font-semibold"
                            aria-live="polite"
                            style={{
                                color:
                                    error || offline
                                        ? "#dc2626"
                                        : saving
                                          ? "#d97706"
                                          : "#9ca3af",
                            }}
                        >
                            {error
                                ? "同步失败 · 已存本地"
                                : offline
                                  ? "离线 · 待同步"
                                  : saving
                                    ? "同步中…"
                                    : "已同步"}
                        </span>
                    }
                />
            </div>

            <nav className="study-tabs mx-auto mt-2 w-full max-w-md">
                {TABS.map((tab) => {
                    const active =
                        tab.key === "home"
                            ? pathname === base || pathname === `${base}/`
                            : pathname.endsWith(`/${tab.key}`);
                    const className = `study-tab ${active ? "on" : ""}`;
                    if (tab.key === "home") {
                        return (
                            <Link
                                key="home"
                                to="/study/$subjectId"
                                params={{ subjectId: subject.id }}
                                className={className}
                            >
                                {tab.label}
                            </Link>
                        );
                    }
                    return (
                        <Link
                            key={tab.key}
                            to="/study/$subjectId/$section"
                            params={{
                                subjectId: subject.id,
                                section: tab.key,
                            }}
                            className={className}
                        >
                            {tab.label}
                        </Link>
                    );
                })}
            </nav>

            <div className="study-body mx-auto w-full max-w-md">
                <div key={pathname} className="section-enter">
                    {children}
                </div>
            </div>
        </div>
    );
}
