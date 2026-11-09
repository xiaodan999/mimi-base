import { useMemo, useState } from "react";
import { Check, MessageSquare, Search } from "lucide-react";

import { filterConversations } from "@/app/chat/conversations";
import type { ChatConversation } from "@/app/chat/types";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { cn } from "@/lib/utils";

export function ConversationPicker({
    open,
    onOpenChange,
    conversations,
    loading,
    selectedId,
    onSelect,
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    conversations: ChatConversation[];
    loading: boolean;
    selectedId: string;
    onSelect: (conversation: ChatConversation | null) => void;
}) {
    const [query, setQuery] = useState("");
    const filtered = useMemo(
        () => filterConversations(conversations, query, "all"),
        [conversations, query],
    );

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-sm rounded-2xl">
                <DialogHeader>
                    <DialogTitle>附上 AI 对话</DialogTitle>
                    <DialogDescription>
                        选中一条聊天记录，提交时会附在反馈里（只读，最多最近 20
                        条）。
                    </DialogDescription>
                </DialogHeader>

                <div className="relative">
                    <Search
                        className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                        aria-hidden="true"
                    />
                    <Input
                        aria-label="搜索对话"
                        className="pl-9"
                        placeholder="搜索对话"
                        value={query}
                        onChange={(event) => setQuery(event.target.value)}
                    />
                </div>

                <div className="max-h-[50vh] space-y-1.5 overflow-y-auto">
                    {loading ? (
                        <div className="flex justify-center py-8">
                            <LoadingSpinner />
                        </div>
                    ) : filtered.length === 0 ? (
                        <p className="py-8 text-center text-sm text-muted-foreground">
                            {conversations.length === 0
                                ? "还没有 AI 对话，可以先去聊天页聊两句"
                                : "没有匹配的对话"}
                        </p>
                    ) : (
                        <>
                            <button
                                type="button"
                                className={cn(
                                    "flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors active:bg-accent",
                                    selectedId === ""
                                        ? "border-primary/40 bg-primary/5"
                                        : "border-border/60",
                                )}
                                onClick={() => {
                                    onSelect(null);
                                    onOpenChange(false);
                                }}
                            >
                                <span className="grid size-8 shrink-0 place-items-center rounded-full bg-muted text-muted-foreground">
                                    <MessageSquare
                                        className="size-4"
                                        aria-hidden="true"
                                    />
                                </span>
                                <span className="min-w-0 flex-1 text-sm">
                                    不附加对话
                                </span>
                                {selectedId === "" && (
                                    <Check
                                        className="size-4 text-primary"
                                        aria-hidden="true"
                                    />
                                )}
                            </button>
                            {filtered.map((conversation) => {
                                const active = conversation.id === selectedId;
                                return (
                                    <button
                                        key={conversation.id}
                                        type="button"
                                        className={cn(
                                            "flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors active:bg-accent",
                                            active
                                                ? "border-primary/40 bg-primary/5"
                                                : "border-border/60",
                                        )}
                                        onClick={() => {
                                            onSelect(conversation);
                                            onOpenChange(false);
                                        }}
                                    >
                                        <span className="grid size-8 shrink-0 place-items-center rounded-full bg-primary/10 text-primary">
                                            <MessageSquare
                                                className="size-4"
                                                aria-hidden="true"
                                            />
                                        </span>
                                        <span className="min-w-0 flex-1">
                                            <span className="block truncate text-sm font-medium">
                                                {conversation.title ||
                                                    "未命名对话"}
                                            </span>
                                            <span className="mt-0.5 block truncate text-[11px] text-muted-foreground">
                                                {conversation.lastMessage ||
                                                    conversation.personaName ||
                                                    "空对话"}
                                            </span>
                                        </span>
                                        {active && (
                                            <Check
                                                className="size-4 shrink-0 text-primary"
                                                aria-hidden="true"
                                            />
                                        )}
                                    </button>
                                );
                            })}
                        </>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    );
}
