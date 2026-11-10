import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { type ReactNode, type RefObject } from "react";

import { useBackDismiss } from "@/lib/useBackDismiss";
import { cn } from "@/lib/utils";

type Props = {
    open: boolean;
    onClose: () => void;
    title: string;
    subtitle?: string;
    children: ReactNode;
    footer?: ReactNode;
    zIndex?: number;
    bodyRef?: RefObject<HTMLDivElement>;
};

/**
 * 移动端底部抽屉，AI 面板和设置页共用。
 *
 * 必须是一个真正的 Radix 模态层。用普通 div 时，下面的抽屉/对话框（都是
 * Radix 模态）会把面板里的每一次点击都当成「点了自己外面的地方」，于是
 * 在新动态里点一句 AI 配文，整个新建窗口就跟着关掉了。
 */
export default function AiSheet({
    open,
    onClose,
    title,
    subtitle,
    children,
    footer,
    zIndex = 80,
    bodyRef,
}: Props) {
    // 手机侧滑返回时关掉抽屉，而不是把下面的页面退掉。
    useBackDismiss(open, onClose);

    return (
        <DialogPrimitive.Root
            open={open}
            onOpenChange={(next) => {
                if (!next) onClose();
            }}
        >
            {/* 不套 Portal：面板留在原来的 DOM 位置，继续继承所在页面的设计
                变量（学习页的 AI 面板依赖外层的 `.study-root`）。
                `pointer-events-auto` 只是兜底：Radix 会给最上层的模态单独
                打开指针事件，下面的层则被关掉。 */}
            <DialogPrimitive.Content
                className="kb-screen pointer-events-auto fixed inset-0 flex items-end justify-center"
                style={{ zIndex }}
                aria-modal="true"
            >
                <div
                    className="absolute inset-0 bg-black/35"
                    onClick={onClose}
                />
                <div className="ai-sheet kb-sheet-max relative flex w-full max-w-xl flex-col overflow-hidden rounded-t-3xl bg-card shadow-2xl">
                    <div className="flex items-center gap-3 border-b border-border px-4 py-3">
                        <div className="min-w-0 flex-1">
                            <DialogPrimitive.Title className="truncate text-[15px] font-extrabold">
                                {title}
                            </DialogPrimitive.Title>
                            {/* Radix 需要 Description 才能正确标注对话框；调用方没给
                                subtitle 时也渲染一个 sr-only 的，避免无障碍告警，
                                同时不让空的占位撑开标题区。 */}
                            <DialogPrimitive.Description
                                className={cn(
                                    "truncate text-[11px] text-muted-foreground",
                                    !subtitle && "sr-only",
                                )}
                            >
                                {subtitle || `${title}面板`}
                            </DialogPrimitive.Description>
                        </div>
                        <button
                            className="grid size-11 shrink-0 place-items-center rounded-full bg-muted text-muted-foreground"
                            onClick={onClose}
                            aria-label="关闭"
                        >
                            <X className="size-4" />
                        </button>
                    </div>
                    <div
                        ref={bodyRef}
                        className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-3"
                    >
                        {children}
                    </div>
                    {footer && (
                        <div className="border-t border-border px-4 py-3">
                            {footer}
                        </div>
                    )}
                </div>
            </DialogPrimitive.Content>
        </DialogPrimitive.Root>
    );
}
