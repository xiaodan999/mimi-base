import { Check, Pencil, Plus, Sparkles, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import {
    BUILTIN_PERSONAS,
    DEFAULT_PERSONA_ID,
    resolvePersona,
} from "@/app/chat/personas";
import type { ChatModel, ChatPersona } from "@/app/chat/types";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
    Sheet,
    SheetContent,
    SheetDescription,
    SheetHeader,
    SheetTitle,
} from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { toastPromise } from "@/lib/toast-promise";
import { cn } from "@/lib/utils";

type PersonaForm = {
    id?: string;
    name: string;
    icon: string;
    description: string;
    prompt: string;
};

const EMPTY_FORM: PersonaForm = {
    name: "",
    icon: "💬",
    description: "",
    prompt: "",
};

export type NewChatSheetProps = {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    models: readonly ChatModel[];
    defaultModel: string;
    personas: readonly ChatPersona[];
    onCreate: (input: {
        model: string;
        persona: ChatPersona;
        title: string;
    }) => Promise<void>;
    onCreatePersona: (input: {
        name: string;
        icon: string;
        description: string;
        prompt: string;
    }) => Promise<ChatPersona>;
    onUpdatePersona: (
        id: string,
        input: {
            name: string;
            icon: string;
            description: string;
            prompt: string;
        },
    ) => Promise<ChatPersona>;
    onDeletePersona: (id: string) => Promise<void>;
};

/**
 * New-conversation sheet: pick a persona (built-in or the user's own) and an
 * allowlisted model. The persona's name/prompt are snapshotted by
 * `onCreate`, so later edits never rewrite this chat.
 */
export function NewChatSheet({
    open,
    onOpenChange,
    models,
    defaultModel,
    personas,
    onCreate,
    onCreatePersona,
    onUpdatePersona,
    onDeletePersona,
}: NewChatSheetProps) {
    const [personaId, setPersonaId] = useState(DEFAULT_PERSONA_ID);
    const [modelId, setModelId] = useState(defaultModel);
    const [form, setForm] = useState<PersonaForm | null>(null);
    const [deleteTarget, setDeleteTarget] = useState<ChatPersona | null>(null);
    const [busy, setBusy] = useState(false);

    useEffect(() => {
        if (!open) return;
        setPersonaId(DEFAULT_PERSONA_ID);
        setModelId(defaultModel || models[0]?.id || "");
        setForm(null);
        setDeleteTarget(null);
    }, [open, defaultModel, models]);

    const allPersonas = [...BUILTIN_PERSONAS, ...personas];
    const selected = resolvePersona(personaId, personas);

    const savePersona = async () => {
        if (!form) return;
        const name = form.name.trim();
        const prompt = form.prompt.trim();
        if (name === "" || prompt === "") {
            toast.error("场景名称和设定都要填");
            return;
        }
        setBusy(true);
        try {
            const input = {
                name,
                icon: form.icon.trim() || "💬",
                description: form.description.trim(),
                prompt,
            };
            if (form.id) {
                await toastPromise(onUpdatePersona(form.id, input), {
                    loading: "保存中…",
                    success: "场景已更新",
                    error: "保存失败",
                });
            } else {
                const created = await toastPromise(onCreatePersona(input), {
                    loading: "保存中…",
                    success: "场景已创建",
                    error: "保存失败",
                });
                setPersonaId(created.id);
            }
            setForm(null);
        } catch {
            // toast already shown
        } finally {
            setBusy(false);
        }
    };

    const create = async () => {
        if (!modelId) {
            toast.error("站点还没有配置聊天模型");
            return;
        }
        setBusy(true);
        try {
            await onCreate({
                model: modelId,
                persona: selected,
                title: "新对话",
            });
            onOpenChange(false);
        } finally {
            setBusy(false);
        }
    };

    return (
        <Sheet open={open} onOpenChange={onOpenChange}>
            <SheetContent
                side="bottom"
                className="max-h-[90dvh] overflow-y-auto rounded-t-2xl pb-[calc(1rem+env(safe-area-inset-bottom))]"
            >
                <SheetHeader>
                    <SheetTitle>新对话</SheetTitle>
                    <SheetDescription>
                        选一个应用场景和模型。聊天记录只保存在你自己的账号里。
                    </SheetDescription>
                </SheetHeader>

                <div className="mt-4 space-y-2">
                    <h3 className="text-xs font-semibold text-muted-foreground">
                        应用场景
                    </h3>
                    <div className="grid grid-cols-2 gap-2">
                        {allPersonas.map((persona) => {
                            const active = persona.id === personaId;
                            return (
                                <div
                                    key={persona.id}
                                    className={cn(
                                        "relative rounded-xl border p-2.5 text-left transition-colors",
                                        active
                                            ? "border-primary bg-primary/5"
                                            : "border-border bg-card",
                                    )}
                                >
                                    <button
                                        type="button"
                                        onClick={() => setPersonaId(persona.id)}
                                        className="w-full text-left"
                                        aria-pressed={active}
                                    >
                                        <div className="flex items-center gap-1.5">
                                            <span className="text-base">
                                                {persona.icon}
                                            </span>
                                            <span className="truncate text-sm font-medium">
                                                {persona.name}
                                            </span>
                                            {active && (
                                                <Check className="ml-auto size-3.5 shrink-0 text-primary" />
                                            )}
                                        </div>
                                        <p className="mt-1 line-clamp-2 text-[11px] leading-snug text-muted-foreground">
                                            {persona.description ||
                                                "自定义场景"}
                                        </p>
                                    </button>
                                    {!persona.builtin && (
                                        <div className="absolute -top-1 -right-1 flex gap-0.5 rounded-lg border border-border bg-background p-0.5 shadow-xs">
                                            <button
                                                type="button"
                                                aria-label={`编辑${persona.name}`}
                                                className="grid size-5 place-items-center rounded text-muted-foreground active:bg-accent"
                                                onClick={() =>
                                                    setForm({
                                                        id: persona.id,
                                                        name: persona.name,
                                                        icon: persona.icon,
                                                        description:
                                                            persona.description,
                                                        prompt: persona.prompt,
                                                    })
                                                }
                                            >
                                                <Pencil className="size-3" />
                                            </button>
                                            <button
                                                type="button"
                                                aria-label={`删除${persona.name}`}
                                                className="grid size-5 place-items-center rounded text-destructive active:bg-accent"
                                                onClick={() =>
                                                    setDeleteTarget(persona)
                                                }
                                            >
                                                <Trash2 className="size-3" />
                                            </button>
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>

                    {form ? (
                        <div className="space-y-2 rounded-xl border border-border bg-card p-3">
                            <div className="flex gap-2">
                                <Input
                                    value={form.icon}
                                    maxLength={4}
                                    aria-label="场景图标"
                                    className="w-14 text-center"
                                    onChange={(event) =>
                                        setForm({
                                            ...form,
                                            icon: event.target.value,
                                        })
                                    }
                                />
                                <Input
                                    value={form.name}
                                    maxLength={40}
                                    placeholder="场景名称"
                                    onChange={(event) =>
                                        setForm({
                                            ...form,
                                            name: event.target.value,
                                        })
                                    }
                                />
                            </div>
                            <Input
                                value={form.description}
                                maxLength={120}
                                placeholder="一句话描述（可选）"
                                onChange={(event) =>
                                    setForm({
                                        ...form,
                                        description: event.target.value,
                                    })
                                }
                            />
                            <Textarea
                                value={form.prompt}
                                rows={4}
                                maxLength={8000}
                                placeholder="场景设定：希望 AI 怎么配合、擅长什么、要避免什么…"
                                onChange={(event) =>
                                    setForm({
                                        ...form,
                                        prompt: event.target.value,
                                    })
                                }
                            />
                            <div className="flex justify-end gap-2">
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => setForm(null)}
                                >
                                    取消
                                </Button>
                                <Button
                                    size="sm"
                                    disabled={busy}
                                    onClick={() => void savePersona()}
                                >
                                    保存场景
                                </Button>
                            </div>
                        </div>
                    ) : (
                        <Button
                            variant="outline"
                            className="w-full"
                            onClick={() => setForm({ ...EMPTY_FORM })}
                        >
                            <Plus className="mr-1 size-4" />
                            新建自定义场景
                        </Button>
                    )}
                </div>

                <div className="mt-4 space-y-2">
                    <h3 className="text-xs font-semibold text-muted-foreground">
                        模型
                    </h3>
                    {models.length === 0 ? (
                        <p className="rounded-xl border border-dashed border-border p-3 text-xs text-muted-foreground">
                            站点还没有配置可用的聊天模型，请联系管理员配置
                            OPENCODE_CHAT_MODELS。
                        </p>
                    ) : (
                        <div className="space-y-1.5">
                            {models.map((model) => {
                                const active = model.id === modelId;
                                return (
                                    <button
                                        key={model.id}
                                        type="button"
                                        onClick={() => setModelId(model.id)}
                                        aria-pressed={active}
                                        className={cn(
                                            "flex w-full items-center gap-2 rounded-xl border px-3 py-2 text-left",
                                            active
                                                ? "border-primary bg-primary/5"
                                                : "border-border bg-card",
                                        )}
                                    >
                                        <Sparkles className="size-3.5 shrink-0 text-primary" />
                                        <span className="min-w-0 flex-1">
                                            <span className="block truncate text-sm font-medium">
                                                {model.label}
                                            </span>
                                            <span className="block text-[10px] text-muted-foreground">
                                                {[
                                                    model.vision
                                                        ? "支持图片"
                                                        : "纯文本",
                                                    model.tools
                                                        ? "可调用工具"
                                                        : "",
                                                    model.reasoning
                                                        ? "显示思考过程"
                                                        : "",
                                                ]
                                                    .filter(Boolean)
                                                    .join(" · ")}
                                            </span>
                                        </span>
                                        {active && (
                                            <Check className="size-4 shrink-0 text-primary" />
                                        )}
                                    </button>
                                );
                            })}
                        </div>
                    )}
                </div>

                <Button
                    className="mt-5 w-full"
                    disabled={busy || models.length === 0}
                    onClick={() => void create()}
                >
                    {busy ? "创建中…" : "开始聊天"}
                </Button>
            </SheetContent>

            <ConfirmDialog
                open={deleteTarget !== null}
                onOpenChange={(next) => {
                    if (!next) setDeleteTarget(null);
                }}
                title={`删除场景「${deleteTarget?.name}」？`}
                description="已经开始的对话保存了当时的场景设定，不会被改写。"
                confirmLabel="删除"
                destructive
                busy={busy}
                onConfirm={async () => {
                    if (!deleteTarget) return;
                    setBusy(true);
                    try {
                        await toastPromise(onDeletePersona(deleteTarget.id), {
                            loading: "删除中…",
                            success: "场景已删除",
                            error: "删除失败",
                        });
                        if (personaId === deleteTarget.id) {
                            setPersonaId(DEFAULT_PERSONA_ID);
                        }
                        setDeleteTarget(null);
                    } catch {
                        // toast already shown
                    } finally {
                        setBusy(false);
                    }
                }}
            />
        </Sheet>
    );
}
