import {
    Bug,
    MessageSquare,
    Monitor,
    Package,
    Sparkles,
    X,
} from "lucide-react";
import { useSyncExternalStore } from "react";

import { useChatConversations } from "@/app/chat/data";
import { useFeedbackReports } from "@/app/feedback/data";
import {
    clearFeedbackErrors,
    getFeedbackErrors,
    subscribeFeedbackErrors,
} from "@/app/feedback/error-buffer";
import { selectOwnBugReports } from "@/app/feedback/filters";
import { feedbackPolishMessages } from "@/app/feedback/prompt";
import {
    reportTotal,
    reportUniqueKey,
    selectReportPageItems,
} from "@/app/feedback/reports";
import { useFeedbackRetry } from "@/app/feedback/retry";
import { useFeedbackDraft } from "@/app/feedback/use-feedback-draft";
import {
    MAX_FEEDBACK_DESCRIPTION,
    MAX_FEEDBACK_TITLE,
} from "@/app/feedback/validation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { Textarea } from "@/components/ui/textarea";
import { useInfiniteList } from "@/hooks/use-infinite-list";
import { useCurrentUser } from "@/lib/auth";

import { AttachmentPicker } from "./attachment-picker";
import { appVersionLabel, browserLabel, ContextChip } from "./context-chips";
import { PagePicker } from "./page-picker";
import { ReportList } from "./report-list";
import { SuccessCard } from "./success-card";
import { blurOnEnter } from "./title-field";

/**
 * 问题反馈 tab: the #39 bug flow, unchanged in behavior. Kept mounted while
 * the other tab is active so a half-written report survives a tab switch.
 *
 * The optional AI conversation is no longer picked here: the chat thread's
 * 反馈问题 action lands on `/feedback?conversation=<id>`, and this panel only
 * shows/detaches that one conversation.
 */
export function BugPanel({
    conversationId,
    onDetachConversation,
}: {
    conversationId?: string;
    onDetachConversation: () => void;
}) {
    const user = useCurrentUser();
    const errors = useSyncExternalStore(
        subscribeFeedbackErrors,
        getFeedbackErrors,
        getFeedbackErrors,
    );
    const reports = useFeedbackReports();
    const conversations = useChatConversations();
    // The id comes from the URL, but only a conversation this account can
    // actually read is shown and submitted; an invalid/stale id is dropped
    // silently (the report simply goes out without an attachment).
    const attached =
        conversationId === undefined
            ? null
            : (conversations.data?.find((item) => item.id === conversationId) ??
              null);
    const retry = useFeedbackRetry();

    const {
        title,
        setTitle,
        description,
        setDescription,
        route,
        setRoute,
        recentRoute,
        attachments,
        setAttachments,
        pagePickerOpen,
        setPagePickerOpen,
        polishing,
        busy,
        pending,
        result,
        setResult,
        polish,
        submitDraft,
    } = useFeedbackDraft({
        kind: "bug",
        polishMessages: ({ title, description, route }) =>
            feedbackPolishMessages({
                title,
                description,
                route,
                errors: errors.map(
                    (entry) => `[${entry.kind}] ${entry.message}`,
                ),
            }),
        submissionExtras: () => ({ conversationId: attached?.id }),
        onSubmitted: () => {
            clearFeedbackErrors();
            // The attachment lives in the URL; clear it so 再提一条 starts
            // clean, matching the old reset behavior.
            if (conversationId !== undefined) onDetachConversation();
        },
    });

    const reportList = useInfiniteList(reports, selectReportPageItems, {
        uniqueBy: reportUniqueKey,
    });
    const bugReports = selectOwnBugReports(reportList.items, user.id);
    const bugTotal = reportTotal(reports.data);

    return (
        <div>
            {result ? (
                <SuccessCard
                    kind="bug"
                    issue={result.issue}
                    reason={result.reason}
                    syncError={result.syncError}
                    onReset={() => setResult(null)}
                />
            ) : (
                <section className="mt-4 space-y-5 rounded-2xl border border-border/60 bg-card p-4 shadow-soft">
                    <div>
                        <div className="flex items-baseline justify-between">
                            <label
                                className="text-sm font-medium"
                                htmlFor="feedback-title"
                            >
                                标题
                            </label>
                            <span className="text-[11px] text-muted-foreground">
                                {title.length}/{MAX_FEEDBACK_TITLE}
                            </span>
                        </div>
                        <Input
                            autoComplete="off"
                            className="mt-2"
                            enterKeyHint="done"
                            id="feedback-title"
                            maxLength={MAX_FEEDBACK_TITLE}
                            placeholder="一句话说明发生了什么"
                            value={title}
                            onChange={(event) => setTitle(event.target.value)}
                            onKeyDown={blurOnEnter}
                        />
                    </div>

                    <div>
                        <div className="flex items-center justify-between gap-2">
                            <label
                                className="text-sm font-medium"
                                htmlFor="feedback-description"
                            >
                                描述
                            </label>
                            <Button
                                type="button"
                                size="sm"
                                variant="ghost"
                                className="h-7 px-2 text-xs text-primary"
                                disabled={polishing}
                                onClick={() => {
                                    void polish();
                                }}
                            >
                                {polishing ? (
                                    <LoadingSpinner className="mr-1.5 size-3.5" />
                                ) : (
                                    <Sparkles
                                        className="mr-1.5 size-3.5"
                                        aria-hidden="true"
                                    />
                                )}
                                AI 帮我整理
                            </Button>
                        </div>
                        <Textarea
                            className="mt-2 min-h-[120px] resize-y"
                            id="feedback-description"
                            maxLength={MAX_FEEDBACK_DESCRIPTION}
                            placeholder="做了什么、看到了什么、期望是什么。写得越具体越好。"
                            rows={6}
                            value={description}
                            onChange={(event) =>
                                setDescription(event.target.value)
                            }
                        />
                        <div className="mt-1 flex justify-end text-[11px] text-muted-foreground">
                            {description.length}/{MAX_FEEDBACK_DESCRIPTION}
                        </div>
                    </div>

                    <div>
                        <p className="text-sm font-medium">自动带上</p>
                        <div className="mt-2 flex flex-wrap gap-1.5">
                            <ContextChip
                                icon={Bug}
                                text={`页面 ${route}`}
                                onClick={() => setPagePickerOpen(true)}
                            />
                            <ContextChip
                                icon={Package}
                                text={`版本 ${appVersionLabel()}`}
                            />
                            <ContextChip
                                icon={Monitor}
                                text={browserLabel(navigator.userAgent)}
                            />
                            <ContextChip
                                icon={Bug}
                                text={
                                    errors.length > 0
                                        ? `最近报错 ${errors.length} 条`
                                        : "暂无报错记录"
                                }
                            />
                        </div>
                    </div>

                    <AttachmentPicker
                        disabled={busy}
                        files={attachments}
                        onChange={setAttachments}
                    />

                    {attached && (
                        <div className="flex items-center gap-2 rounded-xl border border-primary/25 bg-primary/5 px-3 py-2">
                            <MessageSquare
                                className="size-4 shrink-0 text-primary"
                                aria-hidden="true"
                            />
                            <span className="min-w-0 flex-1 truncate text-xs">
                                已附上「{attached.title || "未命名对话"}」
                            </span>
                            <Button
                                type="button"
                                aria-label="移除附带的对话"
                                className="size-7 shrink-0 text-muted-foreground"
                                disabled={busy}
                                size="icon"
                                variant="ghost"
                                onClick={onDetachConversation}
                            >
                                <X className="size-3.5" aria-hidden="true" />
                            </Button>
                        </div>
                    )}

                    <Button
                        className="w-full"
                        disabled={busy}
                        type="button"
                        onClick={() => {
                            void submitDraft();
                        }}
                    >
                        {pending ? (
                            <>
                                <LoadingSpinner className="mr-2 size-4" />
                                提交中...
                            </>
                        ) : (
                            "提交反馈"
                        )}
                    </Button>
                    <p className="text-center text-[11px] leading-4 text-muted-foreground">
                        反馈会创建公开的 GitHub Issue；附件直接上传到 GitHub，
                        公开可见，请勿放敏感信息。
                    </p>
                </section>
            )}

            <section className="mt-7">
                <div className="flex items-baseline justify-between px-1">
                    <h2 className="text-sm font-semibold">我的反馈</h2>
                    <span className="text-[11px] text-muted-foreground">
                        共 {bugTotal} 条
                    </span>
                </div>
                <ReportList
                    loading={reports.isPending}
                    reports={bugReports}
                    showAuthor
                    viewerId={user.id}
                    onRetry={retry.run}
                    retryingId={retry.retryingId}
                    hasNextPage={reportList.hasNextPage}
                    fetchingNextPage={reportList.isFetchingNextPage}
                    onLoadMore={reportList.loadMore}
                    loadError={
                        reports.isError
                            ? (reports.error?.message ?? "加载失败")
                            : null
                    }
                    onReload={() => void reports.refetch()}
                />
            </section>

            <PagePicker
                open={pagePickerOpen}
                onOpenChange={setPagePickerOpen}
                recent={recentRoute}
                value={route}
                onSelect={setRoute}
            />
        </div>
    );
}
