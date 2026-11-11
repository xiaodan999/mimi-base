import { CheckCircle2, ExternalLink } from "lucide-react";

import type { FeedbackIssue } from "@/app/feedback/data";
import { Button } from "@/components/ui/button";

/**
 * Shared post-submit card. The row is always stored; `issue` is only present
 * when the Bun API managed to open a GitHub issue.
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
    const retryHint = feature
        ? "建议已保存，可在下方「大家的建议」里点「重新同步」补建 Issue。"
        : "反馈已保存，可在下方「我的反馈」里点「重新同步」补建 Issue。";
    const notSynced =
        reason === "github_not_configured"
            ? retryHint
            : (syncError ?? retryHint);
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
