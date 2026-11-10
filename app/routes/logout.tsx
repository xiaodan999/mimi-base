import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/logout")({
    preload: false,
    component: Page,
});

function Page() {
    const { logout } = useAuth();
    const navigate = useNavigate();
    const [pending, setPending] = useState(false);

    const confirmLogout = async () => {
        setPending(true);
        try {
            await logout();
            await navigate({ to: "/" });
        } catch {
            setPending(false);
        }
    };

    return (
        <main className="mx-auto flex h-full max-w-md flex-col items-center justify-center gap-4 p-6 text-center">
            <h1 className="text-xl font-semibold">退出登录</h1>
            <p className="text-sm text-muted-foreground">
                确定要离开秘密基地吗？下次进入需要重新登录。
            </p>
            <div className="mt-2 flex w-full flex-col gap-2">
                <Button
                    variant="destructive"
                    disabled={pending}
                    onClick={confirmLogout}
                >
                    {pending ? "正在退出…" : "确认退出"}
                </Button>
                <Button
                    variant="outline"
                    disabled={pending}
                    onClick={() => navigate({ to: "/home" })}
                >
                    取消
                </Button>
            </div>
        </main>
    );
}
