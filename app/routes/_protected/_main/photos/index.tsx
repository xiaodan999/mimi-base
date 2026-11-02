import { createFileRoute, redirect } from "@tanstack/react-router";

// The photo feed was merged into /posts; keep old links working.
export const Route = createFileRoute("/_protected/_main/photos/")({
    beforeLoad: () => {
        throw redirect({ to: "/posts" });
    },
});
