import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";

import { Button } from "@/components/ui/button";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { toastPromise } from "@/lib/toast-promise";

import { useNewPostMutation } from "../_main/posts/-data";

export const Route = createFileRoute("/_protected/post/new-poo")({
    component: Page,
});

function Page() {
    const newPostMutation = useNewPostMutation();
    const [done, setDone] = useState(false);
    useEffect(() => {
        let mounted = true;
        (async () => {
            if (!mounted) return;
            await toastPromise(
                newPostMutation.mutateAsync({
                    text: "💩",
                    layout: "moments",
                    images: [],
                }),
                {
                    loading: "记录💩中...",
                    success: "成功记录了一个💩",
                    error: "记录失败",
                },
            );
            setDone(true);
        })();

        return () => {
            mounted = false;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    return (
        <div className="flex flex-col items-center gap-4 pt-6">
            <img src="/images/poo.png" />
            {!done && (
                <>
                    <p>记录💩中...</p>
                    <LoadingSpinner />
                </>
            )}

            {done && (
                <>
                    <p>完成记录</p>
                    <Button asChild>
                        <Link to="/home">返回主页</Link>
                    </Button>
                </>
            )}
        </div>
    );
}
