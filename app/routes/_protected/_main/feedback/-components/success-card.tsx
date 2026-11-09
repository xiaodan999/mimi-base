import { CheckCircle2, ExternalLink } from "lucide-react";

import type { FeedbackIssue } from "@/app/feedback/data";
import { Button } from "@/components/ui/button";

/**
 * Shared post-submit card. The row is always stored; `issue` is only present
 * when the supervisor managed to open a GitHub issue.
 */
export function SuccessCard({
    kind,
    issue,
    syncError,
    reason,
    onReset,
}: {
    kind: "bug" | "feature";
    issue: FeedbackIssue | null;
    syncError?: string;
    reason?: string;
    onReset: () => void;
}) {
    const feature = kind === "feature";
    const notSynced =
        reason === "github_not_configured"
            ? feature
                ? "已收到建议，暂未同步 GitHub。"
                : "已收到反馈，暂未同步 GitHub。"
            : (syncError ??
              (feature
                  ? "已收到建议，暂未同步 GitHub。"
                  : "已收到反馈，暂未同步 GitHub。"));
    return (
        <section className="mt-4 rounded-2xl border border-emerald-500/25 bg-emerald-500/5 p-5">
            <div className="flex items-start gap-3">
                <span className="grid size-10 shrink-0 place-items-center rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-300">
                    <CheckCircle2 className="size-5" aria-hidden="true" />
                </span>
                <div className="min-w-0 flex-1">
                    <h2 className="text-base font-semibold">
                        {feature ? "建议已提交" : "反馈已提交"}
                    </h2>
                    <p className="mt-1 text-sm leading-6 text-muted-foreground">
                        {issue
                            ? `已创建 GitHub Issue${
                                  issue.number ? ` #${issue.number}` : ""
                              }，开发者会尽快看看${feature ? "这个想法" : ""}。`
                            : notSynced}
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
                        {issue && (
                            <Button asChild size="sm">
                                <a
                                    href={issue.url}
                                    rel="noreferrer"
                                    target="_blank"
                                >
                                    查看 GitHub Issue
                                    <ExternalLink
                                        className="ml-1.5 size-3.5"
                                        aria-hidden="true"
                                    />
                                </a>
                            </Button>
                        )}
                        <Button size="sm" variant="outline" onClick={onReset}>
                            再提一条
                        </Button>
                    </div>
                </div>
            </div>
        </section>
    );
}
