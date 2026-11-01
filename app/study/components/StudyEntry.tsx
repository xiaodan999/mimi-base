import { Link } from "@tanstack/react-router";
import { ChevronRight } from "lucide-react";

import { cardStats } from "../engine";
import { useStudySummaries } from "../progress";
import { SUBJECTS } from "../registry";

/** 首页上的「学习基地」入口，列出所有科目 */
export default function StudyEntry() {
    const { data } = useStudySummaries();
    if (!SUBJECTS.length) return null;

    return (
        <div className="mx-auto mt-4 w-[86%]">
            <div className="mb-1 flex items-center justify-between px-1">
                <span className="text-[13px] font-bold">📚 学习基地</span>
                <Link
                    to="/study"
                    className="flex items-center text-[11px] text-muted-foreground"
                >
                    全部
                    <ChevronRight className="size-3" />
                </Link>
            </div>

            <div className="space-y-2">
                {SUBJECTS.slice(0, 3).map((subject) => {
                    const progress = data?.[subject.id];
                    const cards = progress
                        ? cardStats(subject, progress)
                        : null;
                    return (
                        <Link
                            key={subject.id}
                            to="/study/$subjectId"
                            params={{ subjectId: subject.id }}
                            className="flex items-center gap-3 rounded-2xl border border-green-300/70 bg-white/70 p-2.5"
                        >
                            <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-green-100 text-xl">
                                {subject.icon}
                            </span>
                            <span className="min-w-0 flex-1">
                                <span className="block truncate text-[13.5px] font-bold">
                                    {subject.title}
                                </span>
                                <span className="block truncate text-[11px] text-muted-foreground">
                                    {cards
                                        ? `已掌握 ${cards.known}/${cards.total} 张卡 · ${subject.bank.length} 题`
                                        : `${subject.cards.length} 张卡 · ${subject.bank.length} 题`}
                                </span>
                            </span>
                            <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
                        </Link>
                    );
                })}
            </div>
        </div>
    );
}
