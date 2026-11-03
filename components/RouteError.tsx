import {
    Link,
    useRouter,
    type ErrorComponentProps,
} from "@tanstack/react-router";
import { AlertTriangle, Compass, RotateCcw } from "lucide-react";

import { Button } from "@/components/ui/button";

/** Router-level error screen: keeps the app shell and offers a real retry. */
export function RouteError({ error, reset }: ErrorComponentProps) {
    const router = useRouter();
    const message = error instanceof Error ? error.message : "未知错误";

    return (
        <div className="grid min-h-[60vh] place-items-center p-6 text-center">
            <div className="max-w-sm">
                <AlertTriangle className="mx-auto size-10 text-amber-500" />
                <h1 className="mt-3 text-lg font-semibold">这里出了点问题</h1>
                <p className="mt-1 break-words text-sm text-muted-foreground">
                    {message}
                </p>
                <Button
                    className="mt-4"
                    onClick={() => {
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
