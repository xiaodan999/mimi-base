import { Link } from "@tanstack/react-router";
import { BookOpen, ChevronRight } from "lucide-react";

import { cardStatsFromMeta } from "../engine";
import { SUBJECT_META } from "../meta";
import { useStudySummaries } from "../progress";
import ProgressRing from "./ProgressRing";

/** 首页上的「学习基地」入口，列出所有科目（只读元数据，绝不加载题库） */
export default function StudyEntry() {
    const { data } = useStudySummaries();
    if (!SUBJECT_META.length) return null;

    return (
        <div className="w-full">
            <div className="mb-1 flex items-center justify-between px-1">
                <span className="flex items-center gap-1.5 text-[13px] font-bold">
                    <BookOpen
                        className="size-3.5 text-primary"
                        aria-hidden="true"
                    />
                    学习基地
                </span>
                <Link
                    to="/study"
                    className="flex items-center text-[11px] text-muted-foreground"
                >
                    全部
                    <ChevronRight className="size-3" />
                </Link>
            </div>

            <div className="space-y-2">
                {SUBJECT_META.slice(0, 3).map((meta) => {
                    const progress = data?.[meta.id];
                    const cards = progress
                        ? cardStatsFromMeta(meta, progress)
                        : null;
                    return (
                        <Link
                            key={meta.id}
                            to="/study/$subjectId"
                            params={{ subjectId: meta.id }}
                            className="flex items-center gap-3 rounded-2xl border border-border/60 bg-card p-2.5 shadow-soft transition-colors hover:bg-accent active:bg-accent"
                        >
                            <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-xl">
                                {meta.icon}
                            </span>
                            <span className="min-w-0 flex-1">
                                <span className="block truncate text-[13.5px] font-bold">
                                    {meta.title}
                                </span>
                                <span className="block truncate text-[11px] text-muted-foreground">
                                    {cards
                                        ? `已掌握 ${cards.known}/${cards.total} 张卡 · ${meta.bankCount} 题`
                                        : `${meta.cardCount} 张卡 · ${meta.bankCount} 题`}
                                </span>
                            </span>
                            <ProgressRing
                                value={cards?.percent ?? 0}
                                size={30}
                                stroke={3}
                                className="text-primary"
                            />
                            <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
                        </Link>
                    );
                })}
            </div>
        </div>
    );
}
