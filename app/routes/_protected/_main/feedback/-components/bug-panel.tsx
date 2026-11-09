import { useSyncExternalStore, useState } from "react";
import {
    Bug,
    ChevronRight,
    MessageSquare,
    Monitor,
    Package,
    Sparkles,
    X,
} from "lucide-react";
import { toast } from "sonner";

import { useAi } from "@/app/ai/AiContext";
import { AiError, aiErrorText, chatJSON } from "@/app/ai/client";
import type { ChatConversation } from "@/app/chat/types";
import {
    useFeedbackConversations,
    useFeedbackReports,
    useSubmitFeedback,
    type FeedbackIssue,
} from "@/app/feedback/data";
import {
    clearFeedbackErrors,
    getFeedbackErrors,
    readLastRoute,
    subscribeFeedbackErrors,
} from "@/app/feedback/error-buffer";
import { selectOwnBugReports } from "@/app/feedback/filters";
import {
    FEEDBACK_POLISH_SCHEMA,
    feedbackPolishMessages,
    sanitizePolishedFeedback,
} from "@/app/feedback/prompt";
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

import { ContextChip, appVersionLabel, browserLabel } from "./context-chips";
import { ConversationPicker } from "./conversation-picker";
import { ReportList } from "./report-list";
import { ScreenshotPicker } from "./screenshot-picker";
import { SuccessCard } from "./success-card";

/**
 * 问题反馈 tab: the #39 bug flow, unchanged in behavior. Kept mounted while
 * the other tab is active so a half-written report survives a tab switch.
 */
export function BugPanel() {
    const user = useCurrentUser();
    const [title, setTitle] = useState("");
    const [description, setDescription] = useState("");
    const [route] = useState(() => readLastRoute());
    const [screenshots, setScreenshots] = useState<File[]>([]);
    const [conversation, setConversation] = useState<ChatConversation | null>(
        null,
    );
    const [pickerOpen, setPickerOpen] = useState(false);
    const [polishing, setPolishing] = useState(false);
    // The submitted result keeps the issue link visible until 再提一条.
    const [result, setResult] = useState<{
        issue: FeedbackIssue | null;
        syncError?: string;
        reason?: string;
    } | null>(null);

    const { settings } = useAi();
    const errors = useSyncExternalStore(
        subscribeFeedbackErrors,
        getFeedbackErrors,
        getFeedbackErrors,
    );
    const reports = useFeedbackReports();
    const conversations = useFeedbackConversations();
    const submit = useSubmitFeedback();

    const busy = submit.isPending || polishing;
    const bugReports = selectOwnBugReports(reports.data ?? [], user.id);

    const polish = async () => {
        if (!description.trim()) {
            toast.error("先写几句描述，AI 才好帮你整理");
            return;
        }
        setPolishing(true);
        try {
            const value = await chatJSON<{
                title?: unknown;
                description?: unknown;
            }>(
                settings,
                feedbackPolishMessages({
                    title,
                    description,
                    route,
                    errors: errors.map(
                        (entry) => `[${entry.kind}] ${entry.message}`,
                    ),
                }),
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
            kind: "bug",
            title,
            description,
            screenshots,
        });
        if (!checked.ok) {
            toast.error(checked.error);
            return;
        }

        try {
            const submitted = await submit.mutateAsync({
                kind: "bug",
                title: checked.title,
                description: checked.description,
                route,
                screenshots,
                conversationId: conversation?.id,
            });
            clearFeedbackErrors();
            setTitle("");
            setDescription("");
            setScreenshots([]);
            setConversation(null);
            setResult({
                issue: submitted.issue,
                syncError: submitted.syncError,
                reason: submitted.reason,
            });
            if (submitted.issue) {
                toast.success("反馈已提交，GitHub Issue 已创建");
            } else {
                toast.success("反馈已收到");
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
                            className="mt-2"
                            id="feedback-title"
                            maxLength={MAX_FEEDBACK_TITLE}
                            placeholder="一句话说明发生了什么"
                            value={title}
                            onChange={(event) => setTitle(event.target.value)}
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
                            <ContextChip icon={Bug} text={`页面 ${route}`} />
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

                    <ScreenshotPicker
                        disabled={busy}
                        files={screenshots}
                        onChange={setScreenshots}
                    />

                    <div>
                        <p className="text-sm font-medium">AI 对话（可选）</p>
                        <div className="mt-2 flex items-center gap-1 rounded-xl border border-border/60 bg-muted/20 pr-1">
                            <button
                                type="button"
                                className="flex min-w-0 flex-1 items-center gap-3 px-3 py-2.5 text-left transition-colors active:bg-accent"
                                disabled={busy}
                                onClick={() => setPickerOpen(true)}
                            >
                                <span className="grid size-8 shrink-0 place-items-center rounded-full bg-primary/10 text-primary">
                                    <MessageSquare
                                        className="size-4"
                                        aria-hidden="true"
                                    />
                                </span>
                                <span className="min-w-0 flex-1">
                                    <span className="block text-sm font-medium">
                                        {conversation
                                            ? conversation.title || "未命名对话"
                                            : "附上相关聊天记录"}
                                    </span>
                                    <span className="mt-0.5 block truncate text-[11px] text-muted-foreground">
                                        {conversation
                                            ? conversation.lastMessage ||
                                              conversation.personaName ||
                                              "已选择"
                                            : "遇到问题时和 AI 聊过？选中后一起提交"}
                                    </span>
                                </span>
                                <ChevronRight
                                    className="size-4 shrink-0 text-muted-foreground"
                                    aria-hidden="true"
                                />
                            </button>
                            {conversation && (
                                <Button
                                    type="button"
                                    aria-label="不附加对话"
                                    className="size-8 shrink-0 text-muted-foreground"
                                    size="icon"
                                    variant="ghost"
                                    onClick={() => setConversation(null)}
                                >
                                    <X className="size-4" aria-hidden="true" />
                                </Button>
                            )}
                        </div>
                    </div>

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
                            "提交反馈"
                        )}
                    </Button>
                    <p className="text-center text-[11px] leading-4 text-muted-foreground">
                        反馈只有你和开发者能看到；截图存在基地里，GitHub
                        上只记录文字和截图名称。
                    </p>
                </section>
            )}

            <section className="mt-7">
                <div className="flex items-baseline justify-between px-1">
                    <h2 className="text-sm font-semibold">我的反馈</h2>
                    <span className="text-[11px] text-muted-foreground">
                        最近 {bugReports.length} 条
                    </span>
                </div>
                <ReportList loading={reports.isLoading} reports={bugReports} />
            </section>

            <ConversationPicker
                conversations={conversations.data ?? []}
                loading={conversations.isLoading}
                open={pickerOpen}
                selectedId={conversation?.id ?? ""}
                onOpenChange={setPickerOpen}
                onSelect={setConversation}
            />
        </div>
    );
}
