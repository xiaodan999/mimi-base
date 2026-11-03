import { CircleAlert, RotateCcw } from "lucide-react";

import { Button } from "@/components/ui/button";

type ErrorStateProps = {
    title?: string;
    message?: string;
    onRetry?: () => void;
};

/** In-page error state, used when the surrounding layout should stay. */
export function ErrorState({
    title = "加载失败",
    message = "未知错误",
    onRetry,
}: ErrorStateProps) {
    return (
        <div className="grid place-items-center p-8 text-center">
            <div className="max-w-sm">
                <CircleAlert className="mx-auto size-9 text-amber-500" />
                <h2 className="mt-3 text-base font-semibold">{title}</h2>
                <p className="mt-1 break-words text-sm text-muted-foreground">
                    {message}
                </p>
                {onRetry && (
                    <Button
                        variant="outline"
                        className="mt-4"
                        onClick={onRetry}
                    >
                        <RotateCcw className="mr-1 size-4" />
                        重试
                    </Button>
                )}
            </div>
        </div>
    );
}
