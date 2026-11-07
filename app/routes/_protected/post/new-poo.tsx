import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";

import { useNewPostMutation } from "@/app/feed/data";
import { Button } from "@/components/ui/button";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { toastPromise } from "@/lib/toast-promise";

export const Route = createFileRoute("/_protected/post/new-poo")({
    component: Page,
});

function Page() {
    const newPostMutation = useNewPostMutation();
    const [result, setResult] = useState<"done" | "error" | null>(null);
    const [loading, setLoading] = useState(true);
    // Bumping the attempt re-runs the effect for the retry button.
    const [attempt, setAttempt] = useState(0);

    useEffect(() => {
        let mounted = true;
        setLoading(true);
        setResult(null);
        (async () => {
            try {
                await toastPromise(
                    newPostMutation.mutateAsync({
                        text: "💩",
                        layout: "moments",
                        images: [],
                        thumbs: [],
                    }),
                    {
                        loading: "记录💩中...",
                        success: "成功记录了一个💩",
                        error: "记录失败",
                    },
                );
                if (mounted) setResult("done");
            } catch {
                // toastPromise rejects on mutation failure; surface a retry
                // instead of leaving the "记录💩中..." spinner up forever.
                if (mounted) setResult("error");
            } finally {
                // Always stop the spinner, on success or failure.
                if (mounted) setLoading(false);
            }
        })();

        return () => {
            mounted = false;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [attempt]);

    const retry = () => setAttempt((value) => value + 1);

    return (
        <div className="flex flex-col items-center gap-4 pt-6">
            <img src="/images/poo.png" />
            {loading && (
                <>
                    <p>记录💩中...</p>
                    <LoadingSpinner />
                </>
            )}

            {!loading && result === "error" && (
                <>
                    <p>记录失败，再试一次？</p>
                    <Button onClick={retry}>重试</Button>
                </>
            )}

            {!loading && result === "done" && (
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
