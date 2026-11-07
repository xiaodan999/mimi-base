import { useState } from "react";
import { Link } from "@tanstack/react-router";
import {
    ArrowLeft,
    Brain,
    Check,
    Download,
    MoreHorizontal,
    Pencil,
    Pin,
    PinOff,
    Trash2,
    X,
} from "lucide-react";

import type { ChatConversation, ChatModel } from "@/app/chat/types";
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
import { toastPromise } from "@/lib/toast-promise";

import { ModelPicker } from "./-model-picker";

export type ChatHeaderProps = {
    conversation: ChatConversation;
    models: readonly ChatModel[];
    thinking: string;
    running: boolean;
    onChangeModel: (modelId: string) => void;
    onChangeThinking: (level: string) => void;
    onRename: (title: string) => Promise<void>;
    onDelete: () => Promise<void>;
    onClearSandbox: () => Promise<void>;
    onTogglePin: () => Promise<void>;
    onExport: () => void;
    onOpenMemories: () => void;
};

/**
 * Thread header: back to the list, title, model (allowlist picker) and the
 * conversation menu. Renaming/deleting live here; the persona is fixed
 * because the conversation snapshotted it at creation.
 */
export function ChatHeader({
    conversation,
    models,
    thinking,
    running,
    onChangeModel,
    onChangeThinking,
    onRename,
    onDelete,
    onClearSandbox,
    onTogglePin,
    onExport,
    onOpenMemories,
}: ChatHeaderProps) {
    const [renameOpen, setRenameOpen] = useState(false);
    const [deleteOpen, setDeleteOpen] = useState(false);
    const [titleDraft, setTitleDraft] = useState(conversation.title);
    const [busy, setBusy] = useState(false);

    const sandboxCount = Object.keys(conversation.sandboxFiles).length;

    const submitRename = async () => {
        const title = titleDraft.trim();
        if (title === "" || title === conversation.title) {
            setRenameOpen(false);
            return;
        }
        setBusy(true);
        try {
            await toastPromise(onRename(title), {
                loading: "保存中…",
                success: "标题已更新",
                error: "改名失败",
            });
            setRenameOpen(false);
        } catch {
            // toast already shown
        } finally {
            setBusy(false);
        }
    };

    return (
        <>
            <header className="flex items-center gap-1 border-b border-border/70 bg-background/95 px-2 py-1.5 backdrop-blur-xl">
                <Link
                    to="/chat"
                    aria-label="返回对话列表"
                    className="grid size-9 shrink-0 place-items-center rounded-xl text-muted-foreground active:bg-accent"
                >
                    <ArrowLeft className="size-4" />
                </Link>
                <div className="min-w-0 flex-1">
                    <h1 className="truncate text-sm font-semibold leading-tight">
                        {conversation.title}
                    </h1>
                    <p className="truncate text-[10px] leading-tight text-muted-foreground">
                        {conversation.personaName || "通用助手"}
                        {running ? " · 正在回复" : ""}
                    </p>
                </div>
                <ModelPicker
                    models={models}
                    value={conversation.model}
                    thinking={thinking}
                    onChange={onChangeModel}
                    onThinkingChange={onChangeThinking}
                    disabled={running}
                />
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button
                            variant="ghost"
                            size="icon"
                            className="size-8 shrink-0 rounded-lg text-muted-foreground"
                            aria-label="对话操作"
                        >
                            <MoreHorizontal className="size-4" />
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                        <DropdownMenuItem
                            className="cursor-pointer"
                            onClick={() => {
                                void toastPromise(onTogglePin(), {
                                    loading: "处理中…",
                                    success: conversation.pinned
                                        ? "已取消置顶"
                                        : "已置顶",
                                    error: "操作失败",
                                }).catch(() => {});
                            }}
                        >
                            {conversation.pinned ? (
                                <PinOff className="mr-2 size-4" />
                            ) : (
                                <Pin className="mr-2 size-4" />
                            )}
                            {conversation.pinned ? "取消置顶" : "置顶"}
                        </DropdownMenuItem>
                        <DropdownMenuItem
                            className="cursor-pointer"
                            onClick={onExport}
                        >
                            <Download className="mr-2 size-4" />
                            导出 Markdown
                        </DropdownMenuItem>
                        <DropdownMenuItem
                            className="cursor-pointer"
                            onClick={onOpenMemories}
                        >
                            <Brain className="mr-2 size-4" />
                            AI 的记忆
                        </DropdownMenuItem>
                        <DropdownMenuItem
                            className="cursor-pointer"
                            onClick={() => {
                                setTitleDraft(conversation.title);
                                setRenameOpen(true);
                            }}
                        >
                            <Pencil className="mr-2 size-4" />
                            重命名
                        </DropdownMenuItem>
                        {sandboxCount > 0 && (
                            <DropdownMenuItem
                                className="cursor-pointer"
                                onClick={() => {
                                    void toastPromise(onClearSandbox(), {
                                        loading: "清理中…",
                                        success: "沙箱文件已清空",
                                        error: "清理失败",
                                    }).catch(() => {});
                                }}
                            >
                                <X className="mr-2 size-4" />
                                清空沙箱（{sandboxCount} 个文件）
                            </DropdownMenuItem>
                        )}
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                            className="cursor-pointer text-destructive focus:bg-destructive/10 focus:text-destructive"
                            onClick={() => setDeleteOpen(true)}
                        >
                            <Trash2 className="mr-2 size-4" />
                            删除对话
                        </DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>
            </header>

            <Dialog open={renameOpen} onOpenChange={setRenameOpen}>
                <DialogContent className="max-w-sm">
                    <DialogHeader>
                        <DialogTitle>重命名对话</DialogTitle>
                        <DialogDescription>
                            只改标题，不影响消息内容。
                        </DialogDescription>
                    </DialogHeader>
                    <Input
                        value={titleDraft}
                        maxLength={120}
                        autoFocus
                        onChange={(event) => setTitleDraft(event.target.value)}
                        onKeyDown={(event) => {
                            if (event.key === "Enter") {
                                event.preventDefault();
                                void submitRename();
                            }
                        }}
                    />
                    <DialogFooter className="flex-row justify-end gap-2">
                        <Button
                            variant="ghost"
                            onClick={() => setRenameOpen(false)}
                        >
                            取消
                        </Button>
                        <Button
                            onClick={() => void submitRename()}
                            disabled={busy || titleDraft.trim() === ""}
                        >
                            <Check className="mr-1 size-4" />
                            保存
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
                <DialogContent className="max-w-sm">
                    <DialogHeader>
                        <DialogTitle>删除这个对话？</DialogTitle>
                        <DialogDescription>
                            「{conversation.title}
                            」及其消息会一起删除，无法恢复。
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter className="flex-row justify-end gap-2">
                        <Button
                            variant="ghost"
                            onClick={() => setDeleteOpen(false)}
                        >
                            取消
                        </Button>
                        <Button
                            variant="destructive"
                            disabled={busy}
                            onClick={async () => {
                                setBusy(true);
                                try {
                                    await toastPromise(onDelete(), {
                                        loading: "删除中…",
                                        success: "对话已删除",
                                        error: "删除失败",
                                    });
                                    setDeleteOpen(false);
                                } catch {
                                    // toast already shown
                                } finally {
                                    setBusy(false);
                                }
                            }}
                        >
                            <Trash2 className="mr-1 size-4" />
                            删除
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    );
}
