import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { formatDistanceToNow } from "date-fns/esm";
import { zhCN } from "date-fns/locale";
import {
    MessageCircle,
    MoreHorizontal,
    Pencil,
    Pin,
    PinOff,
    Plus,
    Search,
    Trash2,
} from "lucide-react";

import {
    filterConversations,
    listPersonaChips,
} from "@/app/chat/conversations";
import { findPersona } from "@/app/chat/personas";
import type { ChatConversation, ChatPersona } from "@/app/chat/types";
import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { toastPromise } from "@/lib/toast-promise";
import { cn } from "@/lib/utils";

function relativeTime(value: string): string {
    const date = new Date(value.replace(" ", "T"));
    if (Number.isNaN(date.getTime())) return "";
    try {
        return formatDistanceToNow(date, {
            addSuffix: true,
            locale: zhCN,
        });
    } catch {
        return "";
    }
}

function FilterChip({
    active,
    label,
    count,
    onClick,
}: {
    active: boolean;
    label: string;
    count: number;
    onClick: () => void;
}) {
    return (
        <button
            type="button"
            onClick={onClick}
            className={cn(
                "shrink-0 rounded-full border px-2.5 py-1 text-xs transition-colors active:bg-accent",
                active
                    ? "border-primary/40 bg-primary/10 text-primary"
                    : "border-border/70 bg-card text-muted-foreground",
            )}
        >
            {label}
            <span className="ml-1 tabular-nums opacity-70">{count}</span>
        </button>
    );
}

export type ConversationListProps = {
    conversations: readonly ChatConversation[];
    personas: readonly ChatPersona[];
    loading: boolean;
    onNewChat: () => void;
    onRename: (id: string, title: string) => Promise<void>;
    onDelete: (id: string) => Promise<void>;
    onTogglePin: (id: string, pinned: boolean) => Promise<void>;
};

export function ConversationList({
    conversations,
    personas,
    loading,
    onNewChat,
    onRename,
    onDelete,
    onTogglePin,
}: ConversationListProps) {
    const [renameTarget, setRenameTarget] = useState<ChatConversation | null>(
        null,
    );
    const [deleteTarget, setDeleteTarget] = useState<ChatConversation | null>(
        null,
    );
    const [titleDraft, setTitleDraft] = useState("");
    const [busy, setBusy] = useState(false);
    const [query, setQuery] = useState("");
    const [personaFilter, setPersonaFilter] = useState("all");

    const visible = useMemo(
        () => filterConversations(conversations, query, personaFilter),
        [conversations, query, personaFilter],
    );
    const chips = useMemo(
        () => listPersonaChips(conversations, personas),
        [conversations, personas],
    );

    return (
        <>
            <div className="px-4 pb-3 pt-4">
                <div className="flex items-center justify-between">
                    <div>
                        <h1 className="text-xl font-bold tracking-tight">
                            聊天
                        </h1>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                            和 AI 随便聊聊，记录只存在你的账号里
                        </p>
                    </div>
                    <Button
                        size="sm"
                        className="rounded-xl"
                        onClick={onNewChat}
                    >
                        <Plus className="mr-1 size-4" />
                        新对话
                    </Button>
                </div>
                {conversations.length > 0 && (
                    <div className="relative mt-3">
                        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                        <Input
                            value={query}
                            onChange={(event) => setQuery(event.target.value)}
                            placeholder="搜索对话…"
                            aria-label="搜索对话"
                            className="h-10 rounded-xl bg-card pl-9"
                        />
                    </div>
                )}
                {chips.length > 1 && (
                    <div className="mt-2 flex gap-1.5 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                        <FilterChip
                            active={personaFilter === "all"}
                            label="全部"
                            count={conversations.length}
                            onClick={() => setPersonaFilter("all")}
                        />
                        {chips.map((chip) => (
                            <FilterChip
                                key={chip.id}
                                active={personaFilter === chip.id}
                                label={`${chip.icon} ${chip.name}`}
                                count={chip.count}
                                onClick={() => setPersonaFilter(chip.id)}
                            />
                        ))}
                    </div>
                )}
            </div>

            <div className="space-y-2 px-3 pb-24">
                {loading && conversations.length === 0 && (
                    <>
                        <Skeleton className="h-16 w-full rounded-2xl" />
                        <Skeleton className="h-16 w-full rounded-2xl" />
                        <Skeleton className="h-16 w-full rounded-2xl" />
                    </>
                )}

                {!loading && conversations.length === 0 && (
                    <div className="flex flex-col items-center px-6 py-16 text-center">
                        <div className="grid size-14 place-items-center rounded-2xl bg-primary/10 text-primary">
                            <MessageCircle className="size-6" />
                        </div>
                        <h2 className="mt-4 text-base font-semibold">
                            还没有对话
                        </h2>
                        <p className="mt-1 max-w-xs text-sm leading-relaxed text-muted-foreground">
                            点「新对话」挑一个人格，就可以开始了。
                        </p>
                    </div>
                )}

                {!loading &&
                    conversations.length > 0 &&
                    visible.length === 0 && (
                        <p className="px-6 py-12 text-center text-sm text-muted-foreground">
                            没有匹配「{query}」的对话。
                        </p>
                    )}

                {visible.map((conversation) => {
                    const persona = findPersona(
                        conversation.personaId,
                        personas,
                    );
                    return (
                        <div
                            key={conversation.id}
                            className="flex items-center gap-1 rounded-2xl border border-border/60 bg-card px-3 py-2.5 shadow-sm"
                        >
                            <Link
                                to="/chat/$conversationId"
                                params={{ conversationId: conversation.id }}
                                className="min-w-0 flex-1"
                            >
                                <div className="flex items-center gap-1.5">
                                    {conversation.pinned && (
                                        <Pin
                                            className="size-3 shrink-0 text-primary"
                                            aria-label="已置顶"
                                        />
                                    )}
                                    <span className="text-sm" aria-hidden>
                                        {persona?.icon ?? "💬"}
                                    </span>
                                    <h2 className="truncate text-sm font-semibold">
                                        {conversation.title}
                                    </h2>
                                    <span className="ml-auto shrink-0 text-[10px] text-muted-foreground">
                                        {relativeTime(conversation.updatedAt)}
                                    </span>
                                </div>
                                <p className="mt-0.5 truncate text-xs text-muted-foreground">
                                    {conversation.lastMessage ||
                                        "还没有消息，点进去开始聊"}
                                </p>
                            </Link>
                            <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        className="size-8 shrink-0 rounded-lg text-muted-foreground"
                                        aria-label={`${conversation.title} 的操作`}
                                    >
                                        <MoreHorizontal className="size-4" />
                                    </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                    <DropdownMenuItem
                                        className="cursor-pointer"
                                        onClick={() => {
                                            void toastPromise(
                                                onTogglePin(
                                                    conversation.id,
                                                    !conversation.pinned,
                                                ),
                                                {
                                                    loading: "处理中…",
                                                    success: conversation.pinned
                                                        ? "已取消置顶"
                                                        : "已置顶",
                                                    error: "操作失败",
                                                },
                                            ).catch(() => {});
                                        }}
                                    >
                                        {conversation.pinned ? (
                                            <PinOff className="mr-2 size-4" />
                                        ) : (
                                            <Pin className="mr-2 size-4" />
                                        )}
                                        {conversation.pinned
                                            ? "取消置顶"
                                            : "置顶"}
                                    </DropdownMenuItem>
                                    <DropdownMenuItem
                                        className="cursor-pointer"
                                        onClick={() => {
                                            setTitleDraft(conversation.title);
                                            setRenameTarget(conversation);
                                        }}
                                    >
                                        <Pencil className="mr-2 size-4" />
                                        重命名
                                    </DropdownMenuItem>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem
                                        className="cursor-pointer text-destructive focus:bg-destructive/10 focus:text-destructive"
                                        onClick={() =>
                                            setDeleteTarget(conversation)
                                        }
                                    >
                                        <Trash2 className="mr-2 size-4" />
                                        删除
                                    </DropdownMenuItem>
                                </DropdownMenuContent>
                            </DropdownMenu>
                        </div>
                    );
                })}
            </div>

            <Dialog
                open={renameTarget !== null}
                onOpenChange={(next) => {
                    if (!next) setRenameTarget(null);
                }}
            >
                <DialogContent className="max-w-sm">
                    <DialogHeader>
                        <DialogTitle>重命名对话</DialogTitle>
                    </DialogHeader>
                    <Input
                        value={titleDraft}
                        maxLength={120}
                        autoFocus
                        onChange={(event) => setTitleDraft(event.target.value)}
                        onKeyDown={(event) => {
                            if (event.key !== "Enter") return;
                            event.preventDefault();
                            if (!renameTarget) return;
                            const title = titleDraft.trim();
                            if (!title) return;
                            void toastPromise(
                                onRename(renameTarget.id, title),
                                {
                                    loading: "保存中…",
                                    success: "标题已更新",
                                    error: "改名失败",
                                },
                            )
                                .then(() => setRenameTarget(null))
                                .catch(() => {});
                        }}
                    />
                    <DialogFooter className="flex-row justify-end gap-2">
                        <Button
                            variant="ghost"
                            onClick={() => setRenameTarget(null)}
                        >
                            取消
                        </Button>
                        <Button
                            disabled={busy || titleDraft.trim() === ""}
                            onClick={async () => {
                                if (!renameTarget) return;
                                setBusy(true);
                                try {
                                    await toastPromise(
                                        onRename(
                                            renameTarget.id,
                                            titleDraft.trim(),
                                        ),
                                        {
                                            loading: "保存中…",
                                            success: "标题已更新",
                                            error: "改名失败",
                                        },
                                    );
                                    setRenameTarget(null);
                                } catch {
                                    // toast already shown
                                } finally {
                                    setBusy(false);
                                }
                            }}
                        >
                            保存
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <Dialog
                open={deleteTarget !== null}
                onOpenChange={(next) => {
                    if (!next) setDeleteTarget(null);
                }}
            >
                <DialogContent className="max-w-sm">
                    <DialogHeader>
                        <DialogTitle>
                            删除「{deleteTarget?.title}」？
                        </DialogTitle>
                        <DialogDescription>
                            这个对话的所有消息会一起删除，无法恢复。
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter className="flex-row justify-end gap-2">
                        <Button
                            variant="ghost"
                            onClick={() => setDeleteTarget(null)}
                        >
                            取消
                        </Button>
                        <Button
                            variant="destructive"
                            disabled={busy}
                            onClick={async () => {
                                if (!deleteTarget) return;
                                setBusy(true);
                                try {
                                    await toastPromise(
                                        onDelete(deleteTarget.id),
                                        {
                                            loading: "删除中…",
                                            success: "对话已删除",
                                            error: "删除失败",
                                        },
                                    );
                                    setDeleteTarget(null);
                                } catch {
                                    // toast already shown
                                } finally {
                                    setBusy(false);
                                }
                            }}
                        >
                            删除
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    );
}
