import { useEffect, type ReactNode, type RefObject } from "react";
import { X } from "lucide-react";

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

/** 移动端底部抽屉，AI 面板和设置页共用 */
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
    useEffect(() => {
        if (!open) return;
        const handler = (event: KeyboardEvent) => {
            if (event.key === "Escape") onClose();
        };
        document.addEventListener("keydown", handler);
        return () => document.removeEventListener("keydown", handler);
    }, [open, onClose]);

    if (!open) return null;

    return (
        <div
            className="study-root fixed inset-0 flex items-end justify-center"
            style={{ zIndex }}
            role="dialog"
            aria-modal="true"
            aria-label={title}
        >
            <div className="absolute inset-0 bg-black/35" onClick={onClose} />
            <div className="ai-sheet relative flex max-h-[88dvh] w-full max-w-xl flex-col overflow-hidden rounded-t-3xl bg-white shadow-2xl">
                <div className="flex items-center gap-3 border-b border-black/5 px-4 py-3">
                    <div className="min-w-0 flex-1">
                        <div className="truncate text-[15px] font-extrabold">
                            {title}
                        </div>
                        {subtitle && (
                            <div className="truncate text-[11px] text-muted-foreground">
                                {subtitle}
                            </div>
                        )}
                    </div>
                    <button
                        className="grid size-8 shrink-0 place-items-center rounded-full bg-muted text-muted-foreground"
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
                    <div className="border-t border-black/5 px-4 py-3">
                        {footer}
                    </div>
                )}
            </div>
        </div>
    );
}
