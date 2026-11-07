import { MessageSquareWarning, X } from "lucide-react";

import { Button } from "@/components/ui/button";

/**
 * Shown when the persisted history says the last run never finished (the
 * page was killed mid-run, e.g. Android freezing the backgrounded tab).
 * Tapping 继续生成 re-enters the tool loop from the stored rows.
 */
export function ResumeBanner({
    onResume,
    onDismiss,
}: {
    onResume: () => void;
    onDismiss: () => void;
}) {
    return (
        <div className="mx-4 mb-2 flex items-center gap-3 rounded-xl border border-border bg-card py-2 pl-3 pr-2">
            <MessageSquareWarning className="size-4 shrink-0 text-amber-500" />
            <p className="min-w-0 flex-1 text-sm text-muted-foreground">
                上一条回复没有完成
            </p>
            <Button size="sm" variant="outline" onClick={onResume}>
                继续生成
            </Button>
            <Button
                size="icon"
                variant="ghost"
                className="size-7 text-muted-foreground"
                aria-label="忽略"
                onClick={onDismiss}
            >
                <X className="size-4" />
            </Button>
        </div>
    );
}
