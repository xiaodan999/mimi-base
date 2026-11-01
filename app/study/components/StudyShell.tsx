import type { ReactNode } from "react";
import { Link, useLocation } from "@tanstack/react-router";
import { ChevronLeft } from "lucide-react";

import type { StudySubject } from "../types";
import { useStudy } from "./StudyContext";

const TABS = [
    { key: "home", label: "首页" },
    { key: "cards", label: "知识卡" },
    { key: "quiz", label: "刷题" },
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
    const { saving } = useStudy();
    const { pathname } = useLocation();
    const base = `/study/${subject.id}`;

    return (
        <div className="study-root study-shell">
            <header className="flex items-center gap-2 px-3 pt-3">
                <Link
                    to="/study"
                    className="grid size-9 place-items-center rounded-xl border border-black/5 bg-white shadow-sm"
                    aria-label="返回学习基地"
                >
                    <ChevronLeft className="size-5" />
                </Link>
                <div className="min-w-0 flex-1">
                    <div className="truncate text-[15px] font-extrabold leading-tight">
                        {subject.icon} {subject.title}
                    </div>
                    <div className="truncate text-[11px] text-muted-foreground">
                        {subject.subtitle}
                    </div>
                </div>
                <span
                    className="shrink-0 text-[11px] font-semibold"
                    style={{ color: saving ? "#d97706" : "#9ca3af" }}
                >
                    {saving ? "同步中…" : "已同步"}
                </span>
            </header>

            <nav className="study-tabs mt-2">
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

            <div className="study-body">{children}</div>
        </div>
    );
}
