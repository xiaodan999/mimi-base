import { createFileRoute, redirect } from "@tanstack/react-router";

// The photo feed was merged into the 动态 feed on /home; keep old links working.
export const Route = createFileRoute("/_protected/_main/photos/")({
    beforeLoad: () => {
        throw redirect({ to: "/home" });
    },
});
