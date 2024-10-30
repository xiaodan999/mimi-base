import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_protected/secret")({
    component: () => <div>Hello /_protected/secret!</div>,
});
