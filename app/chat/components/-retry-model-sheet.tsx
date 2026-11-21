import type { ChatModel } from "@/app/chat/types";
import {
    Sheet,
    SheetContent,
    SheetHeader,
    SheetTitle,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

type Props = {
    target: string | null;
    onOpenChange: (open: boolean) => void;
    models: readonly ChatModel[];
    currentModelId: string | undefined;
    running: boolean;
    onRegenerate: (messageId: string, opts?: { model: ChatModel }) => void;
};

/** 换模型重新生成 sheet, shared by the last reply's action menu. */
export default function RetryModelSheet({
    target,
    onOpenChange,
    models,
    currentModelId,
    running,
    onRegenerate,
}: Props) {
    return (
        <Sheet open={target !== null} onOpenChange={onOpenChange}>
            <SheetContent
                side="bottom"
                className="mx-auto w-full max-w-md px-4 pb-6"
            >
                <SheetHeader className="pb-1 text-left">
                    <SheetTitle>换个模型重新生成</SheetTitle>
                </SheetHeader>
                <div className="space-y-1.5 pt-1">
                    {models.map((candidate) => (
                        <button
                            key={candidate.id}
                            type="button"
                            disabled={running}
                            onClick={() => {
                                if (!target) return;
                                onOpenChange(false);
                                onRegenerate(target, { model: candidate });
                            }}
                            className={cn(
                                "flex w-full items-center justify-between rounded-xl border px-3 py-2.5 text-left text-sm active:bg-accent",
                                candidate.id === currentModelId
                                    ? "border-primary/40 bg-primary/5"
                                    : "border-border/70 bg-card",
                            )}
                        >
                            <span className="font-medium">
                                {candidate.label}
                            </span>
                            {candidate.id === currentModelId && (
                                <span className="text-[11px] text-primary">
                                    当前模型
                                </span>
                            )}
                        </button>
                    ))}
                </div>
            </SheetContent>
        </Sheet>
    );
}
