import { useQueryClient } from "@tanstack/react-query";
import { Brain, Trash2 } from "lucide-react";

import type { ChatMemory } from "@/app/chat/types";
import { Button } from "@/components/ui/button";
import {
    Sheet,
    SheetContent,
    SheetDescription,
    SheetHeader,
    SheetTitle,
} from "@/components/ui/sheet";
import { useCurrentUser } from "@/lib/auth";
import pb from "@/lib/pb";
import { qk } from "@/lib/query-keys";
import { toastPromise } from "@/lib/toast-promise";

/**
 * View and delete the durable facts the model saved about the user. The list
 * is owner-scoped by PB rules; deleting is immediate (the model can be asked
 * to forget via the `memory` tool too).
 */
export function MemorySheet({
    open,
    onOpenChange,
    memories,
    loading,
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    memories: readonly ChatMemory[];
    loading: boolean;
}) {
    const user = useCurrentUser();
    const queryClient = useQueryClient();

    const remove = (memory: ChatMemory) => {
        void toastPromise(pb.collection("chat_memories").delete(memory.id), {
            loading: "删除中…",
            success: "已忘记这条",
            error: "删除失败",
        })
            .then(() =>
                queryClient.invalidateQueries({
                    queryKey: qk.chat.memories(user.id),
                }),
            )
            .catch(() => {});
    };

    return (
        <Sheet open={open} onOpenChange={onOpenChange}>
            <SheetContent
                side="bottom"
                className="flex max-h-[70dvh] flex-col gap-2 px-4 pb-6"
            >
                <SheetHeader className="shrink-0 text-left">
                    <SheetTitle className="flex items-center gap-1.5">
                        <Brain className="size-4 text-primary" aria-hidden />
                        AI 的长期记忆
                    </SheetTitle>
                    <SheetDescription>
                        聊天里让 AI
                        记住的事都会出现在这里，之后每次对话都带着它们；不需要的可以删掉。
                    </SheetDescription>
                </SheetHeader>
                <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
                    {loading && (
                        <p className="py-8 text-center text-sm text-muted-foreground">
                            加载中…
                        </p>
                    )}
                    {!loading && memories.length === 0 && (
                        <p className="py-8 text-center text-sm leading-relaxed text-muted-foreground">
                            还没有记住任何事。
                            <br />
                            在聊天里说「记住：我对花生过敏」试试。
                        </p>
                    )}
                    <ul className="space-y-1.5">
                        {memories.map((memory) => (
                            <li
                                key={memory.id}
                                className="flex items-start gap-2 rounded-xl border border-border/60 bg-card px-3 py-2"
                            >
                                <span className="min-w-0 flex-1 break-words text-sm leading-relaxed">
                                    {memory.content}
                                </span>
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    aria-label="删除这条记忆"
                                    onClick={() => remove(memory)}
                                    className="size-7 shrink-0 rounded-lg text-muted-foreground active:text-destructive"
                                >
                                    <Trash2 className="size-3.5" />
                                </Button>
                            </li>
                        ))}
                    </ul>
                </div>
            </SheetContent>
        </Sheet>
    );
}
