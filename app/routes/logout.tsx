import { useQueryClient } from "@tanstack/react-query";
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
    const queryClient = useQueryClient();
    const navigate = useNavigate();
    const [pending, setPending] = useState(false);

    const confirmLogout = async () => {
        setPending(true);
        try {
            await logout();
            // The next account must not see the previous one's cached rows.
            queryClient.clear();
            // Land on the login page so switching accounts is one more step.
            await navigate({ href: "/login", replace: true });
        } catch {
            setPending(false);
        }
    };

    return (
        <main className="mx-auto flex h-full max-w-md flex-col items-center justify-center gap-4 p-6 text-center">
            <h1 className="text-xl font-semibold">退出登录</h1>
            <p className="text-sm text-muted-foreground">
                退出后可以回到登录页，换另一个账号进入。
            </p>
            <div className="mt-2 flex w-full flex-col gap-2">
                <Button
                    variant="destructive"
                    disabled={pending}
                    onClick={confirmLogout}
                >
                    {pending ? "正在退出…" : "退出当前账号"}
                </Button>
                <Button
                    variant="outline"
                    disabled={pending}
                    onClick={() => navigate({ to: "/profile" })}
                >
                    取消
                </Button>
            </div>
        </main>
    );
}
