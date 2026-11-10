import {
    type ErrorComponentProps,
    Link,
    useRouter,
} from "@tanstack/react-router";
import { AlertTriangle, Compass, RotateCcw } from "lucide-react";
import { useEffect } from "react";

import { Button } from "@/components/ui/button";
import { isChunkLoadError, reloadOnce } from "@/lib/chunk-load-error";

/** Router-level error screen: keeps the app shell and offers a real retry. */
export function RouteError({ error, reset }: ErrorComponentProps) {
    const router = useRouter();
    // A lazy chunk that failed to download cannot be retried in place: the
    // memoised rejection keeps throwing. Reload so the tab fetches the assets
    // the current deploy actually has (new hashes after an update).
    const chunkError = isChunkLoadError(error);

    useEffect(() => {
        if (chunkError) reloadOnce();
    }, [chunkError]);

    const title = chunkError ? "需要刷新页面" : "这里出了点问题";
    const message = chunkError
        ? "页面文件没能下载下来，可能是网络波动或新版本刚发布。刷新一下就好。"
        : error instanceof Error
          ? error.message
          : "未知错误";

    return (
        <div className="grid min-h-[60vh] place-items-center p-6 text-center">
            <div className="max-w-sm">
                <AlertTriangle className="mx-auto size-10 text-warning" />
                <h1 className="mt-3 text-lg font-semibold">{title}</h1>
                <p className="mt-1 text-sm break-words text-muted-foreground">
                    {message}
                </p>
                <Button
                    className="mt-4"
                    onClick={() => {
                        if (chunkError) {
                            window.location.reload();
                            return;
                        }
                        reset();
                        void router.invalidate();
                    }}
                >
                    <RotateCcw className="mr-1 size-4" />
                    重试
                </Button>
            </div>
        </div>
    );
}

/** Router-level 404. */
export function RouteNotFound() {
    return (
        <div className="grid min-h-[60vh] place-items-center p-6 text-center">
            <div className="max-w-sm">
                <Compass className="mx-auto size-10 text-muted-foreground" />
                <h1 className="mt-3 text-lg font-semibold">找不到这个页面</h1>
                <p className="mt-1 text-sm text-muted-foreground">
                    它可能已经被移走，或者链接写错了。
                </p>
                <Button className="mt-4" asChild>
                    <Link to="/home">回到首页</Link>
                </Button>
            </div>
        </div>
    );
}
