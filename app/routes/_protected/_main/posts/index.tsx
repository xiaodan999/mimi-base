import { createFileRoute } from "@tanstack/react-router";

import LoadingPage from "@/components/LoadingPage";

import Post from "./-components/post";
import { usePosts } from "./-data";

export const Route = createFileRoute("/_protected/_main/posts/")({
    component: Posts,
});

function Posts() {
    const { data, isPending, isError } = usePosts();
    if (isPending) return <LoadingPage />;
    if (isError) return <div>出错啦</div>;
    return (
        <section className="h-full divide-y divide-green-400 overflow-auto">
            {data.map((post) => (
                <Post key={post.id} {...post} />
            ))}
        </section>
    );
}
