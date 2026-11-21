import { useCallback, useState } from "react";
import { toast } from "sonner";

import { useAi } from "@/app/ai/AiContext";
import {
    AiError,
    aiErrorText,
    type AiMessage,
    chatJSON,
} from "@/app/ai/client";
import {
    type SubmitFeedbackResult,
    useSubmitFeedback,
} from "@/app/feedback/data";
import { readLastRoute } from "@/app/feedback/error-buffer";
import {
    FEEDBACK_POLISH_SCHEMA,
    sanitizePolishedFeedback,
} from "@/app/feedback/prompt";
import { type FeedbackKind, validateFeedback } from "@/app/feedback/validation";

export type FeedbackDraftOutcome = Pick<
    SubmitFeedbackResult,
    "issue" | "reason" | "syncError"
> | null;

type UseFeedbackDraftOptions = {
    kind: FeedbackKind;
    /** Kind-specific polish prompt (bugs also send the console buffer). */
    polishMessages: (input: {
        title: string;
        description: string;
        route: string;
    }) => AiMessage[];
    /** Extra submit fields; bugs attach the selected conversation. */
    submissionExtras?: () => { conversationId?: string };
    /** Kind-specific cleanup after a successful submit. */
    onSubmitted?: () => void;
};

/**
 * Shared title/description/route/attachment draft for the bug and feature
 * panels: validation, AI polish and submission stay identical, only the
 * prompt and the success copy differ.
 */
export function useFeedbackDraft({
    kind,
    polishMessages,
    submissionExtras,
    onSubmitted,
}: UseFeedbackDraftOptions) {
    const { settings } = useAi();
    const submit = useSubmitFeedback();
    const [title, setTitle] = useState("");
    const [description, setDescription] = useState("");
    const [recentRoute] = useState(() => readLastRoute());
    const [route, setRoute] = useState(recentRoute);
    const [pagePickerOpen, setPagePickerOpen] = useState(false);
    const [attachments, setAttachments] = useState<File[]>([]);
    const [polishing, setPolishing] = useState(false);
    const [result, setResult] = useState<FeedbackDraftOutcome>(null);

    const busy = submit.isPending || polishing;
    const noun = kind === "bug" ? "反馈" : "建议";

    const polish = useCallback(async () => {
        if (!description.trim()) {
            toast.error(
                kind === "feature"
                    ? "先写几句想法，AI 才好帮你整理"
                    : "先写几句描述，AI 才好帮你整理",
            );
            return;
        }
        setPolishing(true);
        try {
            const value = await chatJSON<{
                title?: unknown;
                description?: unknown;
            }>(
                settings,
                polishMessages({ title, description, route }),
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
    }, [description, kind, polishMessages, route, settings, title]);

    const submitDraft = useCallback(async () => {
        if (busy) return;
        const checked = validateFeedback({
            kind,
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
                kind,
                title: checked.title,
                description: checked.description,
                route,
                attachments,
                ...submissionExtras?.(),
            });
            setTitle("");
            setDescription("");
            setAttachments([]);
            onSubmitted?.();
            setResult({
                issue: submitted.issue,
                syncError: submitted.syncError,
                reason: submitted.reason,
            });
            if (submitted.issue) {
                toast.success(`${noun}已提交，GitHub Issue 已创建`);
            } else {
                toast.success(`${noun}已保存，可稍后重新同步`);
            }
        } catch (error) {
            toast.error(
                error instanceof Error ? error.message : "提交失败，请稍后再试",
            );
        }
    }, [
        attachments,
        busy,
        description,
        kind,
        noun,
        onSubmitted,
        route,
        submit,
        submissionExtras,
        title,
    ]);

    return {
        kind,
        title,
        description,
        route,
        recentRoute,
        attachments,
        pagePickerOpen,
        polishing,
        busy,
        pending: submit.isPending,
        result,
        setTitle,
        setDescription,
        setRoute,
        setAttachments,
        setPagePickerOpen,
        setResult,
        polish,
        submitDraft,
    };
}
