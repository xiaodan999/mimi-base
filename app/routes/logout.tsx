import { useEffect } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";

import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/logout")({
    preload: false,
    component: Page,
});

function Page() {
    const { logout } = useAuth();
    const navigate = useNavigate();

    useEffect(() => {
        logout().then(() => {
            navigate({ to: "/" });
        });
    }, [logout, navigate]);

    return (
        <div>
            <h1>Bye bye...</h1>
            <Button
                onClick={() => {
                    logout();
                }}
            >
                Logout
            </Button>
        </div>
    );
}
