import { createFileRoute } from "@tanstack/react-router";

import Post from "./-components/post";

export const Route = createFileRoute("/_protected/_main/posts/")({
    component: Posts,
});

function Posts() {
    return (
        <section className="h-full divide-y divide-green-400 overflow-auto">
            <Post />
            <Post />
            <Post />
            <Post />
            <Post />
            <Post />
            <Post />
            <Post />
            <Post />
        </section>
    );
}
