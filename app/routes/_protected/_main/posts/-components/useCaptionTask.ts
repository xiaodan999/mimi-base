import {
    useEffect,
    useMemo,
    useRef,
    useState,
    type Dispatch,
    type SetStateAction,
} from "react";

import { useAi } from "@/app/ai/AiContext";
import { hashText, readAiCache, removeAiCache } from "@/app/ai/cache";
import {
    AiError,
    aiErrorText,
    chatJSON,
    isAiCanceled,
    throwIfAborted,
} from "@/app/ai/client";
import { imagesToDataUrls } from "@/app/ai/image";
import { captionMessages } from "@/app/ai/posts";
import { decideAiRestore } from "@/app/ai/restore";
import { useAiTasks } from "@/app/ai/tasks";
import type { PostLayout } from "@/lib/pb-types";

import { previewImageBlob, type PreviewImage } from "./usePostDraft";

export type CaptionOption = { style: string; text: string };

type UseCaptionTaskArgs = {
    open: boolean;
    text: string;
    setText: Dispatch<SetStateAction<string>>;
    layout: PostLayout;
    images: PreviewImage[];
    seededKey: string | null;
};

/**
 * Owns the AI caption panel: the per-draft task key, running/restoring the
 * long-lived `runTask`, and the loading/error/result state. The heavy logic
 * lives here so the composer itself stays a thin composition shell.
 */
export function useCaptionTask({
    open,
    text,
    setText,
    layout,
    images,
    seededKey,
}: UseCaptionTaskArgs) {
    const { settings, configured, openSettings } = useAi();
    const { runTask, cancel, attend, find, getResult } = useAiTasks();
    const [captionOpen, setCaptionOpen] = useState(false);
    const [captionLoading, setCaptionLoading] = useState(false);
    const [captionError, setCaptionError] = useState("");
    const [captions, setCaptions] = useState<CaptionOption[]>([]);
    const captionKeyRef = useRef<string | null>(null);
    /** 当前 captions 属于哪份草稿，避免切换草稿后拿旧结果充数。 */
    const captionsKeyRef = useRef<string | null>(null);
    const restoredOpenRef = useRef(false);

    /** 同一份草稿（文字 + 排版 + 照片）对应同一个 AI 配文任务。 */
    const captionKey = useMemo(() => {
        const fingerprint = images
            .map((image) =>
                image.kind === "file"
                    ? `file:${image.file.name}:${image.file.size}:${image.file.lastModified}`
                    : `existing:${image.name}`,
            )
            .join(",");
        return `captions:${hashText(
            `${text.trim()}|${layout}|${fingerprint}`,
        )}`;
    }, [text, layout, images]);

    // 配文面板开着时不用再弹完成通知
    useEffect(() => {
        if (!captionOpen) return;
        return attend("captions");
    }, [captionOpen, attend]);

    const suggestCaptions = async (
        options: { force?: boolean; restore?: boolean } = {},
    ) => {
        if (!configured) {
            openSettings();
            return;
        }

        const force = options.force === true;
        const restore = options.restore === true;
        const key = captionKey;

        if (captionKeyRef.current && captionKeyRef.current !== key) {
            cancel(captionKeyRef.current);
        }
        captionKeyRef.current = key;

        if (!force) {
            // 面板关掉后任务还在后台跑；重新打开草稿时先接回已有结果。
            const decision = decideAiRestore<CaptionOption[]>({
                task: find(key),
                local: captionsKeyRef.current === key ? captions : null,
                result: getResult<CaptionOption[]>(key),
                cached: readAiCache<CaptionOption[]>(key),
                hasValue: (list) => list.length > 0,
            });
            if (decision.kind === "ready") {
                captionsKeyRef.current = key;
                setCaptions(decision.value);
                setCaptionError("");
                setCaptionLoading(false);
                setCaptionOpen(true);
                return;
            }
            if (decision.kind === "error") {
                setCaptionOpen(true);
                setCaptionLoading(false);
                setCaptionError(decision.message);
                return;
            }
            if (decision.kind === "canceled") {
                setCaptionOpen(true);
                setCaptionLoading(false);
                setCaptionError("已取消");
                return;
            }
            if (decision.kind === "none" && restore) {
                // 没有可恢复的结果，别在打开草稿时偷偷发新请求。
                return;
            }
            // "running" 落到下面：接上同一个任务，显示加载态。
        }

        setCaptionOpen(true);
        setCaptionLoading(true);
        setCaptionError("");
        setCaptions([]);
        captionsKeyRef.current = null;
        if (force) removeAiCache(key);
        try {
            const list = await runTask<CaptionOption[]>({
                key,
                cacheKey: key,
                group: "captions",
                force,
                title: "AI 配文",
                subtitle: text.trim().slice(0, 30) || `${images.length} 张照片`,
                kind: "json",
                summarize: (value) => `生成了 ${value.length} 条文案`,
                run: async ({ signal }) => {
                    // Existing photos are protected URLs; fetch them so the
                    // vision model sees the photos already on the post too.
                    const settled = await Promise.allSettled(
                        images
                            .slice(0, 3)
                            .map((image) => previewImageBlob(image)),
                    );
                    const sources = settled.flatMap((result) =>
                        result.status === "fulfilled" ? [result.value] : [],
                    );
                    throwIfAborted(signal);

                    const imageUrls = await imagesToDataUrls(sources, {
                        maxSize: 768,
                    });
                    throwIfAborted(signal);

                    const result = await chatJSON<{
                        captions?: { style?: unknown; text?: unknown }[];
                    }>(
                        settings,
                        captionMessages({
                            imageUrls,
                            hint: text,
                            layout,
                            count: images.length,
                        }),
                        signal,
                    );

                    const value = (result.captions ?? []).flatMap((item) => {
                        if (typeof item.text !== "string") return [];
                        const textValue = item.text.trim().slice(0, 80);
                        if (!textValue) return [];
                        return [
                            {
                                style:
                                    typeof item.style === "string"
                                        ? item.style
                                        : "文案",
                                text: textValue,
                            },
                        ];
                    });

                    if (value.length === 0) {
                        throw new AiError("AI 没给出文案，再试一次？");
                    }
                    return value;
                },
            });
            captionsKeyRef.current = key;
            setCaptions(list);
        } catch (err) {
            if (!isAiCanceled(err)) setCaptionError(aiErrorText(err));
        } finally {
            setCaptionLoading(false);
        }
    };

    // 生成途中关掉草稿时 AI 面板也会关掉，任务继续在后台跑；
    // 回来时把已经生成（或还在生成）的配文重新摆出来。
    useEffect(() => {
        if (!open) {
            restoredOpenRef.current = false;
            return;
        }
        if (restoredOpenRef.current) return;
        // Wait for the draft to be seeded; on the first pass after opening,
        // captionKey still describes the previous draft.
        if (seededKey === null) return;
        restoredOpenRef.current = true;
        if (!configured) return;
        if (!find(captionKey)) return;
        void suggestCaptions({ restore: true });
        // 只在草稿重新打开时恢复一次，不跟输入内容联动。
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open, captionKey, configured, seededKey]);

    const applyCaption = (caption: string) => {
        setText((previous) =>
            previous.trim() ? `${previous.trim()}\n${caption}` : caption,
        );
        setCaptionOpen(false);
    };

    return {
        captionOpen,
        setCaptionOpen,
        captionLoading,
        captionError,
        captions,
        suggestCaptions,
        applyCaption,
    };
}

export type CaptionTask = ReturnType<typeof useCaptionTask>;
