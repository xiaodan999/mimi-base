import { Lightbulb, Package, Sparkles } from "lucide-react";

import { useFeatureSuggestions } from "@/app/feedback/data";
import { selectFeatureSuggestions } from "@/app/feedback/filters";
import { featurePolishMessages } from "@/app/feedback/prompt";
import { flattenReportPages, reportTotal } from "@/app/feedback/reports";
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
import { useCurrentUser } from "@/lib/auth";

import { AttachmentPicker } from "./attachment-picker";
import { appVersionLabel, ContextChip } from "./context-chips";
import { PagePicker } from "./page-picker";
import { ReportList } from "./report-list";
import { SuccessCard } from "./success-card";
import { blurOnEnter } from "./title-field";

/**
 * 功能建议 tab: title + want/why/how description + up to 3 attachments. No
 * console errors and no chat conversation are attached, and the resulting row
 * is `kind: "feature"` so the other account can read it in 大家的建议.
 */
export function FeaturePanel() {
    const user = useCurrentUser();
    const suggestions = useFeatureSuggestions();
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
        kind: "feature",
        polishMessages: ({ title, description, route }) =>
            featurePolishMessages({ title, description, route }),
    });

    const shared = selectFeatureSuggestions(
        flattenReportPages(suggestions.data),
    );
    const sharedTotal = reportTotal(suggestions.data);

    return (
        <div>
            {result ? (
                <SuccessCard
                    kind="feature"
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
                                htmlFor="feature-title"
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
                            id="feature-title"
                            maxLength={MAX_FEEDBACK_TITLE}
                            placeholder="一句话说明你想要什么"
                            value={title}
                            onChange={(event) => setTitle(event.target.value)}
                            onKeyDown={blurOnEnter}
                        />
                    </div>

                    <div>
                        <div className="flex items-center justify-between gap-2">
                            <label
                                className="text-sm font-medium"
                                htmlFor="feature-description"
                            >
                                想要什么 / 为什么 / 希望怎么用
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
                            id="feature-description"
                            maxLength={MAX_FEEDBACK_DESCRIPTION}
                            placeholder="想要什么？为什么需要？希望怎么用？写得越具体越好。"
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
                                icon={Lightbulb}
                                text={`页面 ${route}`}
                                onClick={() => setPagePickerOpen(true)}
                            />
                            <ContextChip
                                icon={Package}
                                text={`版本 ${appVersionLabel()}`}
                            />
                        </div>
                    </div>

                    <AttachmentPicker
                        disabled={busy}
                        files={attachments}
                        onChange={setAttachments}
                    />

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
                            "提交建议"
                        )}
                    </Button>
                    <p className="text-center text-[11px] leading-4 text-muted-foreground">
                        建议会出现在「大家的建议」里，两个人都能看到；附件直接上传到
                        GitHub，公开可见，请勿放敏感信息。
                    </p>
                </section>
            )}

            <section className="mt-7">
                <div className="flex items-baseline justify-between px-1">
                    <h2 className="text-sm font-semibold">大家的建议</h2>
                    <span className="text-[11px] text-muted-foreground">
                        共 {sharedTotal} 条
                    </span>
                </div>
                <ReportList
                    emptyText="还没有人提过建议，来当第一个吧"
                    loading={suggestions.isPending}
                    reports={shared}
                    showAuthor
                    viewerId={user.id}
                    onRetry={retry.run}
                    retryingId={retry.retryingId}
                    hasNextPage={suggestions.hasNextPage}
                    fetchingNextPage={suggestions.isFetchingNextPage}
                    onLoadMore={() => void suggestions.fetchNextPage()}
                    loadError={
                        suggestions.isError
                            ? (suggestions.error?.message ?? "加载失败")
                            : null
                    }
                    onReload={() => void suggestions.refetch()}
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
