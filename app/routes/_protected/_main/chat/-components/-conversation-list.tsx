import { Link } from "@tanstack/react-router";
import { formatDistanceToNow } from "date-fns";
import { zhCN } from "date-fns/locale/zh-CN";
import {
    Brain,
    CheckCircle2,
    Circle,
    ListChecks,
    Loader2,
    MessageCircle,
    MoreHorizontal,
    Pencil,
    Pin,
    PinOff,
    Plus,
    Search,
    Trash2,
} from "lucide-react";
import { useMemo, useState } from "react";

import {
    filterConversations,
    listPersonaChips,
} from "@/app/chat/conversations";
import { findPersona } from "@/app/chat/personas";
import type { ChatConversation, ChatPersona } from "@/app/chat/types";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import PageHeader from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
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
    /** Conversations with a run in flight; rows show a working indicator. */
    runningIds: ReadonlySet<string>;
    onNewChat: () => void;
    onOpenMemories: () => void;
    onRename: (id: string, title: string) => Promise<void>;
    onDelete: (id: string) => Promise<void>;
    onDeleteMany: (ids: string[]) => Promise<void>;
    onTogglePin: (id: string, pinned: boolean) => Promise<void>;
};

export function ConversationList({
    conversations,
    personas,
    loading,
    runningIds,
    onNewChat,
    onOpenMemories,
    onRename,
    onDelete,
    onDeleteMany,
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
    const [selectMode, setSelectMode] = useState(false);
    const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
    const [bulkConfirmOpen, setBulkConfirmOpen] = useState(false);

    const visible = useMemo(
        () => filterConversations(conversations, query, personaFilter),
        [conversations, query, personaFilter],
    );
    const chips = useMemo(
        () => listPersonaChips(conversations, personas),
        [conversations, personas],
    );

    const exitSelectMode = () => {
        setSelectMode(false);
        setSelected(new Set());
    };

    const toggleSelected = (id: string) => {
        setSelected((previous) => {
            const next = new Set(previous);
            if (next.has(id)) {
                next.delete(id);
            } else {
                next.add(id);
            }
            return next;
        });
    };

    const allVisibleSelected =
        visible.length > 0 &&
        visible.every((conversation) => selected.has(conversation.id));

    return (
        <>
            <div className="mx-auto w-full max-w-md px-4 pt-[calc(1rem+env(safe-area-inset-top))] pb-3">
                <PageHeader
                    title="聊天"
                    description={
                        selectMode
                            ? selected.size > 0
                                ? `已选 ${selected.size} 个对话`
                                : "点对话勾选，可以一次删掉多个"
                            : "只存在你的账号里"
                    }
                    actions={
                        !selectMode ? (
                            <>
                                {conversations.length > 0 && (
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        className="rounded-xl text-muted-foreground"
                                        aria-label="批量管理对话"
                                        onClick={() => setSelectMode(true)}
                                    >
                                        <ListChecks className="size-5" />
                                    </Button>
                                )}
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    className="rounded-xl text-muted-foreground"
                                    onClick={onOpenMemories}
                                >
                                    <Brain className="mr-1 size-4" />
                                    记忆
                                </Button>
                                <Button
                                    size="sm"
                                    className="rounded-xl"
                                    onClick={onNewChat}
                                >
                                    <Plus className="mr-1 size-4" />
                                    新对话
                                </Button>
                            </>
                        ) : undefined
                    }
                />
                {selectMode ? (
                    <div className="mt-3 flex items-center gap-2">
                        <Button
                            variant="outline"
                            size="sm"
                            className="rounded-xl"
                            onClick={() => {
                                if (allVisibleSelected) {
                                    setSelected(new Set());
                                } else {
                                    setSelected(
                                        new Set(
                                            visible.map(
                                                (conversation) =>
                                                    conversation.id,
                                            ),
                                        ),
                                    );
                                }
                            }}
                        >
                            {allVisibleSelected ? "取消全选" : "全选"}
                        </Button>
                        <Button
                            variant="destructive"
                            size="sm"
                            className="rounded-xl"
                            disabled={selected.size === 0}
                            onClick={() => setBulkConfirmOpen(true)}
                        >
                            删除
                            {selected.size > 0 ? `（${selected.size}）` : ""}
                        </Button>
                        <Button
                            variant="ghost"
                            size="sm"
                            className="ml-auto rounded-xl"
                            onClick={exitSelectMode}
                        >
                            取消
                        </Button>
                    </div>
                ) : (
                    <>
                        {conversations.length > 0 && (
                            <div className="relative mt-3">
                                <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                                <Input
                                    value={query}
                                    onChange={(event) =>
                                        setQuery(event.target.value)
                                    }
                                    placeholder="搜索对话…"
                                    aria-label="搜索对话"
                                    className="h-10 rounded-xl bg-card pl-9"
                                />
                            </div>
                        )}
                        {chips.length > 1 && (
                            <div className="mt-2 flex [scrollbar-width:none] gap-1.5 overflow-x-auto pb-1 [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
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
                                        onClick={() =>
                                            setPersonaFilter(chip.id)
                                        }
                                    />
                                ))}
                            </div>
                        )}
                    </>
                )}
            </div>

            <div className="mx-auto w-full max-w-md space-y-2 px-3 pb-24">
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
                            点「新对话」选一个应用场景，就可以开始了。
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
                    const running = runningIds.has(conversation.id);
                    const checked = selected.has(conversation.id);
                    const main = (
                        <>
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
                                {running && (
                                    <span className="shrink-0">
                                        <Loader2
                                            className="size-3.5 animate-spin text-primary"
                                            aria-hidden
                                        />
                                        <span className="sr-only">
                                            回复生成中
                                        </span>
                                    </span>
                                )}
                                <span className="ml-auto shrink-0 text-[10px] text-muted-foreground">
                                    {relativeTime(conversation.updatedAt)}
                                </span>
                            </div>
                            <p
                                className={cn(
                                    "mt-0.5 truncate text-xs",
                                    running
                                        ? "text-primary/80"
                                        : "text-muted-foreground",
                                )}
                            >
                                {running
                                    ? "正在生成回复…"
                                    : conversation.lastMessage ||
                                      "还没有消息，点进去开始聊"}
                            </p>
                        </>
                    );
                    if (selectMode) {
                        return (
                            <button
                                key={conversation.id}
                                type="button"
                                role="checkbox"
                                aria-checked={checked}
                                onClick={() => toggleSelected(conversation.id)}
                                className={cn(
                                    "flex w-full items-center gap-2.5 rounded-2xl border px-3 py-2.5 text-left shadow-xs transition-colors active:bg-accent",
                                    checked
                                        ? "border-primary/50 bg-primary/5"
                                        : "border-border/60 bg-card",
                                )}
                            >
                                {checked ? (
                                    <CheckCircle2
                                        className="size-5 shrink-0 text-primary"
                                        aria-hidden
                                    />
                                ) : (
                                    <Circle
                                        className="size-5 shrink-0 text-muted-foreground/50"
                                        aria-hidden
                                    />
                                )}
                                <div className="min-w-0 flex-1">{main}</div>
                            </button>
                        );
                    }
                    return (
                        <div
                            key={conversation.id}
                            className="flex items-center gap-1 rounded-2xl border border-border/60 bg-card px-3 py-2.5 shadow-xs"
                        >
                            <Link
                                to="/chat/$conversationId"
                                params={{ conversationId: conversation.id }}
                                className="min-w-0 flex-1"
                            >
                                {main}
                            </Link>
                            {!selectMode && (
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
                                                        success:
                                                            conversation.pinned
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
                                                setTitleDraft(
                                                    conversation.title,
                                                );
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
                            )}
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

            <ConfirmDialog
                open={deleteTarget !== null}
                onOpenChange={(next) => {
                    if (!next) setDeleteTarget(null);
                }}
                title={`删除「${deleteTarget?.title}」？`}
                description="这个对话的所有消息会一起删除，无法恢复。"
                confirmLabel="删除"
                destructive
                busy={busy}
                onConfirm={async () => {
                    if (!deleteTarget) return;
                    setBusy(true);
                    try {
                        await toastPromise(onDelete(deleteTarget.id), {
                            loading: "删除中…",
                            success: "对话已删除",
                            error: "删除失败",
                        });
                        setDeleteTarget(null);
                    } catch {
                        // toast already shown
                    } finally {
                        setBusy(false);
                    }
                }}
            />

            <ConfirmDialog
                open={bulkConfirmOpen}
                onOpenChange={(next) => {
                    if (!next) setBulkConfirmOpen(false);
                }}
                title={`删除选中的 ${selected.size} 个对话？`}
                description="这些对话的所有消息会一起删除，无法恢复。"
                confirmLabel="删除"
                destructive
                busy={busy}
                confirmDisabled={selected.size === 0}
                onConfirm={async () => {
                    const ids = [...selected];
                    setBusy(true);
                    try {
                        await toastPromise(onDeleteMany(ids), {
                            loading: "删除中…",
                            success: `已删除 ${ids.length} 个对话`,
                            error: "删除失败",
                        });
                        setBulkConfirmOpen(false);
                        exitSelectMode();
                    } catch {
                        // toast already shown
                    } finally {
                        setBusy(false);
                    }
                }}
            />
        </>
    );
}
