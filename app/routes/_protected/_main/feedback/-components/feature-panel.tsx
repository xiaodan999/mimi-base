import { Lightbulb, Package, Sparkles } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { useAi } from "@/app/ai/AiContext";
import { AiError, aiErrorText, chatJSON } from "@/app/ai/client";
import {
    type FeedbackIssue,
    useFeatureSuggestions,
    useSubmitFeedback,
} from "@/app/feedback/data";
import { readLastRoute } from "@/app/feedback/error-buffer";
import { selectFeatureSuggestions } from "@/app/feedback/filters";
import {
    featurePolishMessages,
    FEEDBACK_POLISH_SCHEMA,
    sanitizePolishedFeedback,
} from "@/app/feedback/prompt";
import { useFeedbackRetry } from "@/app/feedback/retry";
import {
    MAX_FEEDBACK_DESCRIPTION,
    MAX_FEEDBACK_TITLE,
    validateFeedback,
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

/**
 * 功能建议 tab: title + want/why/how description + up to 3 attachments. No
 * console errors and no chat conversation are attached, and the resulting row
 * is `kind: "feature"` so the other account can read it in 大家的建议.
 */
export function FeaturePanel() {
    const user = useCurrentUser();
    const [title, setTitle] = useState("");
    const [description, setDescription] = useState("");
    const [recentRoute] = useState(() => readLastRoute());
    const [route, setRoute] = useState(recentRoute);
    const [attachments, setAttachments] = useState<File[]>([]);
    const [polishing, setPolishing] = useState(false);
    const [pagePickerOpen, setPagePickerOpen] = useState(false);
    const [result, setResult] = useState<{
        issue: FeedbackIssue | null;
        syncError?: string;
        reason?: string;
    } | null>(null);

    const { settings } = useAi();
    const suggestions = useFeatureSuggestions();
    const submit = useSubmitFeedback();
    const retry = useFeedbackRetry();

    const busy = submit.isPending || polishing;
    const shared = selectFeatureSuggestions(suggestions.data ?? []);

    const polish = async () => {
        if (!description.trim()) {
            toast.error("先写几句想法，AI 才好帮你整理");
            return;
        }
        setPolishing(true);
        try {
            const value = await chatJSON<{
                title?: unknown;
                description?: unknown;
            }>(
                settings,
                featurePolishMessages({ title, description, route }),
                undefined,
                {
                    schema: FEEDBACK_POLISH_SCHEMA,
                    maxTokens: 900,
                    temperature: 0.2,
                },
            );
            const polished = sanitizePolishedFeedback({
                title: value.title,
                description: value.description,
            });
            if (!polished) throw new AiError("AI 整理结果不完整，再试一次");
            setTitle(polished.title);
            setDescription(polished.description);
            toast.success("已整理，可以再改改");
        } catch (error) {
            // The typed text stays in the form either way; a 503 is expected
            // in dev without an upstream key.
            if (error instanceof AiError && error.status === 503) {
                toast.error("AI 暂时不可用，可以直接提交");
            } else {
                toast.error(aiErrorText(error));
            }
        } finally {
            setPolishing(false);
        }
    };

    const handleSubmit = async () => {
        if (busy) return;
        const checked = validateFeedback({
            kind: "feature",
            title,
            description,
            attachments,
        });
        if (!checked.ok) {
            toast.error(checked.error);
            return;
        }

        try {
            const submitted = await submit.mutateAsync({
                kind: "feature",
                title: checked.title,
                description: checked.description,
                route,
                attachments,
            });
            setTitle("");
            setDescription("");
            setAttachments([]);
            setResult({
                issue: submitted.issue,
                syncError: submitted.syncError,
                reason: submitted.reason,
            });
            if (submitted.issue) {
                toast.success("建议已提交，GitHub Issue 已创建");
            } else {
                toast.success("建议已保存，可稍后重新同步");
            }
        } catch (error) {
            toast.error(
                error instanceof Error ? error.message : "提交失败，请稍后再试",
            );
        }
    };

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
                            className="mt-2"
                            id="feature-title"
                            maxLength={MAX_FEEDBACK_TITLE}
                            placeholder="一句话说明你想要什么"
                            value={title}
                            onChange={(event) => setTitle(event.target.value)}
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
                            void handleSubmit();
                        }}
                    >
                        {submit.isPending ? (
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
                        共 {shared.length} 条
                    </span>
                </div>
                <ReportList
                    emptyText="还没有人提过建议，来当第一个吧"
                    loading={suggestions.isLoading}
                    reports={shared}
                    showAuthor
                    viewerId={user.id}
                    onRetry={retry.run}
                    retryingId={retry.retryingId}
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
