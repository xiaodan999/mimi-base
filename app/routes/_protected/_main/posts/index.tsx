import { createFileRoute, redirect } from "@tanstack/react-router";

// The feed moved onto the home page; keep old links, bookmarks and filtered
// URLs (?month= / ?q=) working by forwarding to /home with the same search.
export const Route = createFileRoute("/_protected/_main/posts/")({
    beforeLoad: () => {
        throw redirect({ to: "/home", search: true });
    },
});
