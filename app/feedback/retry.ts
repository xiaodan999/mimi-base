import { useState } from "react";

import { toastPromise } from "@/lib/toast-promise";

import { type FeedbackReportRecord, useRetryFeedbackReport } from "./data";

/**
 * Shared retry action for the feedback list. One pending report at a time is
 * enough for this screen; the mutation invalidates both the bug and feature
 * caches when it settles.
 */
export function useFeedbackRetry() {
    const retry = useRetryFeedbackReport();
    const [retryingId, setRetryingId] = useState<string | null>(null);

    const run = async (report: FeedbackReportRecord) => {
        setRetryingId(report.id);
        try {
            await toastPromise(retry.mutateAsync(report.id), {
                loading: "正在同步到 GitHub…",
                success: (result) =>
                    result.issue
                        ? "已创建 GitHub Issue"
                        : (result.syncError ?? "反馈已保存，暂未同步 GitHub"),
                error: "同步失败，稍后再试",
            });
        } catch {
            // toastPromise already surfaced the failure.
        } finally {
            setRetryingId(null);
        }
    };

    return { retryingId, run };
}
