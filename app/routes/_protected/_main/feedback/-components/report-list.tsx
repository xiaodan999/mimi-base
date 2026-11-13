import {
    ExternalLink,
    FileText,
    ImageIcon,
    Inbox,
    Paperclip,
    RefreshCw,
} from "lucide-react";
import { useEffect } from "react";
import { useInView } from "react-intersection-observer";

import {
    attachmentSizeLabel,
    isImageAttachment,
    parseAttachmentList,
} from "@/app/feedback/attachments";
import {
    FEEDBACK_PAGE_SIZE,
    type FeedbackReportRecord,
    useFeedbackIssueStates,
} from "@/app/feedback/data";
import {
    type FeedbackIssueState,
    parseIssueNumber,
    parseRecordIssueState,
} from "@/app/feedback/issue-state";
import { ErrorState } from "@/components/ErrorState";
import TouXiang from "@/components/TouXiang";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { formatDate } from "@/lib/date";
import { getUserAvatarUrl, getUserRing } from "@/lib/pb";
import { toUser } from "@/lib/pb-types";
import { cn } from "@/lib/utils";

function statusLabel(
    status: FeedbackReportRecord["status"],
    issueState?: FeedbackIssueState,
): string {
    if (status === "issue_created") {
        return issueState === "closed" ? "已关闭" : "已建 Issue";
    }
    if (status === "failed") return "同步失败";
    return "待同步";
}

function statusClass(
    status: FeedbackReportRecord["status"],
    issueState?: FeedbackIssueState,
): string {
    if (status === "issue_created") {
        return issueState === "closed"
            ? "border-violet-500/30 bg-violet-500/10 text-violet-700 dark:text-violet-300"
            : "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300";
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
    showAuthor = false,
    viewerId,
    onRetry,
    retryingId = null,
    hasNextPage = false,
    fetchingNextPage = false,
    onLoadMore,
    loadError = null,
    onReload,
}: {
    reports: FeedbackReportRecord[];
    loading: boolean;
    emptyText?: string;
    /** Show the reporter's avatar and name above the report. */
    showAuthor?: boolean;
    /** Enables 重新同步 for the viewer's own stored/failed reports. */
    viewerId?: string;
    onRetry?: (report: FeedbackReportRecord) => void;
    retryingId?: string | null;
    /** More rows exist behind the loaded window. */
    hasNextPage?: boolean;
    fetchingNextPage?: boolean;
    /** Omit for a single-page list (no footer). */
    onLoadMore?: () => void;
    /** Page fetch failed while earlier rows are still on screen. */
    loadError?: string | null;
    onReload?: () => void;
}) {
    const issueStates = useFeedbackIssueStates(reports).data ?? {};
    const { ref, inView } = useInView();

    useEffect(() => {
        if (
            !inView ||
            !onLoadMore ||
            !hasNextPage ||
            fetchingNextPage ||
            // A failed page would otherwise retry on every render; the user
            // gets the footer's 重试 button instead.
            loadError
        ) {
            return;
        }
        onLoadMore();
    }, [inView, onLoadMore, hasNextPage, fetchingNextPage, loadError]);

    if (loading) {
        return (
            <div className="mt-3 flex justify-center py-8">
                <LoadingSpinner />
            </div>
        );
    }
    if (loadError && reports.length === 0) {
        return (
            <div className="mt-3 rounded-2xl border border-border/60 bg-card shadow-soft">
                <ErrorState message={loadError} onRetry={onReload} />
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
                const attachments = parseAttachmentList(report.attachments);
                const issueNumber = parseIssueNumber(report.issue_number);
                const issueState = issueNumber
                    ? (issueStates[issueNumber] ??
                      parseRecordIssueState(report.issue_state))
                    : undefined;
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
                                    statusClass(report.status, issueState),
                                )}
                                variant="outline"
                            >
                                {statusLabel(report.status, issueState)}
                            </Badge>
                        </div>
                        <p className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">
                            {report.description}
                        </p>
                        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                            <span>{formatDate(report.created)}</span>
                            {attachments.length > 0 && (
                                <span className="inline-flex items-center gap-1">
                                    <Paperclip
                                        className="size-3"
                                        aria-hidden="true"
                                    />
                                    {attachments.length} 个附件
                                </span>
                            )}
                            {report.conversation && <span>附带 AI 对话</span>}
                            {issueNumber && !report.issue_url && (
                                <span>Issue #{issueNumber}</span>
                            )}
                            {report.issue_url && (
                                <a
                                    className="inline-flex items-center gap-1 font-medium text-primary hover:underline"
                                    href={report.issue_url}
                                    rel="noreferrer"
                                    target="_blank"
                                >
                                    查看 Issue
                                    {issueNumber ? ` #${issueNumber}` : ""}
                                    <ExternalLink
                                        className="size-3"
                                        aria-hidden="true"
                                    />
                                </a>
                            )}
                        </div>
                        {attachments.length > 0 && (
                            <div className="mt-1.5 flex flex-wrap gap-1.5">
                                {attachments.map((attachment) => {
                                    const image = isImageAttachment(attachment);
                                    return (
                                        <a
                                            key={attachment.url}
                                            className="inline-flex max-w-full items-center gap-1 rounded-full border border-border/60 bg-muted/30 px-2 py-0.5 text-[11px] text-muted-foreground transition-colors active:bg-accent"
                                            href={attachment.url}
                                            rel="noreferrer"
                                            target="_blank"
                                            title={attachment.name}
                                        >
                                            {image ? (
                                                <ImageIcon
                                                    className="size-3 shrink-0"
                                                    aria-hidden="true"
                                                />
                                            ) : (
                                                <FileText
                                                    className="size-3 shrink-0"
                                                    aria-hidden="true"
                                                />
                                            )}
                                            <span className="max-w-[9rem] truncate">
                                                {attachment.name}
                                            </span>
                                            {!image && attachment.size ? (
                                                <span className="shrink-0 opacity-70">
                                                    {attachmentSizeLabel(
                                                        attachment.size,
                                                    )}
                                                </span>
                                            ) : null}
                                        </a>
                                    );
                                })}
                            </div>
                        )}
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
            {onLoadMore && (
                <li className="pt-1">
                    {loadError ? (
                        <div className="flex flex-col items-center gap-1 py-2 text-center">
                            <p className="text-[11px] text-muted-foreground">
                                后面的反馈没加载出来
                            </p>
                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="h-7 gap-1 px-2 text-[11px]"
                                onClick={onReload}
                            >
                                <RefreshCw
                                    className="size-3"
                                    aria-hidden="true"
                                />
                                重试
                            </Button>
                        </div>
                    ) : fetchingNextPage ? (
                        <div className="flex items-center justify-center gap-2 py-3 text-[11px] text-muted-foreground">
                            <LoadingSpinner className="size-3.5" />
                            加载更多…
                        </div>
                    ) : hasNextPage ? (
                        <>
                            <div className="flex justify-center pb-2">
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    className="h-7 px-3 text-[11px] text-muted-foreground"
                                    onClick={onLoadMore}
                                >
                                    加载更多
                                </Button>
                            </div>
                            {/* Scroll sentinel: the button covers the accessible
                                path, the observer makes reaching the end load
                                the next page on its own. */}
                            <div
                                ref={ref}
                                aria-hidden="true"
                                className="h-1 w-full"
                            />
                        </>
                    ) : reports.length > FEEDBACK_PAGE_SIZE ? (
                        <p className="py-2 text-center text-[11px] text-muted-foreground">
                            没有更多了
                        </p>
                    ) : null}
                </li>
            )}
        </ul>
    );
}
