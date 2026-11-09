import { ExternalLink, ImageIcon, Inbox, RefreshCw } from "lucide-react";

import type { FeedbackReportRecord } from "@/app/feedback/data";
import TouXiang from "@/components/TouXiang";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { formatDate } from "@/lib/date";
import { getUserAvatarUrl, getUserRing } from "@/lib/pb";
import { toUser } from "@/lib/pb-types";
import { cn } from "@/lib/utils";

function statusLabel(status: FeedbackReportRecord["status"]): string {
    if (status === "issue_created") return "已建 Issue";
    if (status === "failed") return "同步失败";
    return "待同步";
}

function statusClass(status: FeedbackReportRecord["status"]): string {
    if (status === "issue_created") {
        return "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300";
    }
    if (status === "failed") {
        return "border-destructive/30 bg-destructive/10 text-destructive";
    }
    return "border-border bg-muted/50 text-muted-foreground";
}

export function ReportList({
    reports,
    loading,
    emptyText = "还没有提交过反馈",
    photoLabel = "截图",
    showAuthor = false,
    viewerId,
    onRetry,
    retryingId = null,
}: {
    reports: FeedbackReportRecord[];
    loading: boolean;
    emptyText?: string;
    photoLabel?: string;
    /** Shared suggestions show who wrote them; 我的反馈 does not. */
    showAuthor?: boolean;
    /** Enables 重新同步 for the viewer's own stored/failed reports. */
    viewerId?: string;
    onRetry?: (report: FeedbackReportRecord) => void;
    retryingId?: string | null;
}) {
    if (loading) {
        return (
            <div className="mt-3 flex justify-center py-8">
                <LoadingSpinner />
            </div>
        );
    }
    if (reports.length === 0) {
        return (
            <div className="mt-3 flex flex-col items-center gap-2 rounded-2xl border border-dashed border-border/70 bg-muted/20 px-4 py-8 text-center">
                <Inbox
                    className="size-6 text-muted-foreground"
                    aria-hidden="true"
                />
                <p className="text-sm text-muted-foreground">{emptyText}</p>
            </div>
        );
    }

    return (
        <ul className="mt-3 space-y-2">
            {reports.map((report) => {
                const author = report.expand?.owner
                    ? toUser(report.expand.owner)
                    : null;
                const authorName = author?.user_name || "朋友";
                return (
                    <li
                        key={report.id}
                        className="rounded-2xl border border-border/60 bg-card p-4 shadow-soft"
                    >
                        {showAuthor && (
                            <div className="mb-2 flex items-center gap-2">
                                {author && (
                                    <TouXiang
                                        size={24}
                                        touXiangUrl={getUserAvatarUrl(author)}
                                        name={authorName}
                                        {...getUserRing(author)}
                                    />
                                )}
                                <span className="text-xs font-medium">
                                    {authorName}
                                </span>
                            </div>
                        )}
                        <div className="flex items-start gap-2">
                            <p className="min-w-0 flex-1 text-sm font-semibold">
                                {report.title}
                            </p>
                            <Badge
                                className={cn(
                                    "shrink-0 text-[10px]",
                                    statusClass(report.status),
                                )}
                                variant="outline"
                            >
                                {statusLabel(report.status)}
                            </Badge>
                        </div>
                        <p className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">
                            {report.description}
                        </p>
                        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                            <span>{formatDate(report.created)}</span>
                            {(report.screenshots?.length ?? 0) > 0 && (
                                <span className="inline-flex items-center gap-1">
                                    <ImageIcon
                                        className="size-3"
                                        aria-hidden="true"
                                    />
                                    {report.screenshots?.length} 张{photoLabel}
                                </span>
                            )}
                            {report.conversation && <span>附带 AI 对话</span>}
                            {report.issue_url && (
                                <a
                                    className="inline-flex items-center gap-1 font-medium text-primary hover:underline"
                                    href={report.issue_url}
                                    rel="noreferrer"
                                    target="_blank"
                                >
                                    查看 Issue
                                    <ExternalLink
                                        className="size-3"
                                        aria-hidden="true"
                                    />
                                </a>
                            )}
                        </div>
                        {report.status === "failed" && report.error && (
                            <p className="mt-2 rounded-lg bg-destructive/5 px-2 py-1.5 text-[11px] text-destructive">
                                {report.error}
                            </p>
                        )}
                        {onRetry &&
                            viewerId &&
                            report.owner === viewerId &&
                            (report.status === "stored" ||
                                report.status === "failed") && (
                                <div className="mt-2 flex justify-end">
                                    <Button
                                        type="button"
                                        variant="outline"
                                        size="sm"
                                        className="h-7 gap-1 px-2 text-[11px]"
                                        disabled={retryingId === report.id}
                                        onClick={() => onRetry(report)}
                                    >
                                        <RefreshCw
                                            className={cn(
                                                "size-3",
                                                retryingId === report.id &&
                                                    "animate-spin",
                                            )}
                                            aria-hidden="true"
                                        />
                                        {retryingId === report.id
                                            ? "同步中…"
                                            : "重新同步"}
                                    </Button>
                                </div>
                            )}
                    </li>
                );
            })}
        </ul>
    );
}
