import { Loader2 } from "lucide-react";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";

export type ConfirmDialogProps = {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    title: ReactNode;
    /** Always rendered: Radix uses it as the accessible description. */
    description: ReactNode;
    confirmLabel: string;
    cancelLabel?: string;
    /** Red confirm button. Defaults to false (normal primary action). */
    destructive?: boolean;
    /** Disables the confirm action and swaps in a spinner. */
    busy?: boolean;
    confirmDisabled?: boolean;
    onConfirm: () => void;
    className?: string;
};

/**
 * The app's shared confirmation surface. On phones it is a native-feeling
 * bottom sheet: a grabber, centred title/description, and two full-width
 * 48px actions with the destructive one on top and 取消 safely below. From
 * `sm` up it falls back to the regular centred dialog so desktop stays
 * compact.
 *
 * The explicit cancel action replaces the corner X; tapping the backdrop,
 * the mobile back gesture and Escape still dismiss. The title and
 * description are required because Radix wires them to aria-labelledby /
 * aria-describedby.
 */
export function ConfirmDialog({
    open,
    onOpenChange,
    title,
    description,
    confirmLabel,
    cancelLabel = "取消",
    destructive = false,
    busy = false,
    confirmDisabled = false,
    onConfirm,
    className,
}: ConfirmDialogProps) {
    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent
                role="alertdialog"
                mobileSheet
                showCloseButton={false}
                overlayClassName="bg-black/50 backdrop-blur-[2px]"
                className={className}
            >
                <div
                    aria-hidden="true"
                    className="mx-auto mt-2 h-1.5 w-10 shrink-0 rounded-full bg-muted-foreground/30 sm:hidden"
                />
                <div className="px-5 pt-4 pb-[calc(1.25rem+env(safe-area-inset-bottom))] sm:px-0 sm:pt-0 sm:pb-0">
                    <DialogHeader>
                        <DialogTitle>{title}</DialogTitle>
                        <DialogDescription className="leading-relaxed">
                            {description}
                        </DialogDescription>
                    </DialogHeader>
                    <div className="mt-5 flex flex-col-reverse gap-2 sm:mt-4 sm:flex-row sm:justify-end">
                        <Button
                            type="button"
                            variant="outline"
                            disabled={busy}
                            className="h-12 w-full rounded-xl text-base sm:h-10 sm:w-auto sm:rounded-md sm:px-4 sm:text-sm"
                            onClick={() => onOpenChange(false)}
                        >
                            {cancelLabel}
                        </Button>
                        <Button
                            type="button"
                            variant={destructive ? "destructive" : "default"}
                            disabled={busy || confirmDisabled}
                            aria-busy={busy}
                            className="h-12 w-full rounded-xl text-base font-semibold sm:h-10 sm:w-auto sm:rounded-md sm:px-4 sm:text-sm"
                            onClick={onConfirm}
                        >
                            {busy && (
                                <Loader2
                                    className="mr-2 size-4 animate-spin"
                                    aria-hidden="true"
                                />
                            )}
                            {confirmLabel}
                        </Button>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}
