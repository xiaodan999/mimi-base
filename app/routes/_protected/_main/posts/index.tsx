import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Pencil } from "lucide-react";

import LoadingPage from "@/components/LoadingPage";
import { Button } from "@/components/ui/button";
import { Drawer, DrawerContent } from "@/components/ui/drawer";

import NewPost from "./-components/new-post";
import Post from "./-components/post";
import { usePosts } from "./-data";

export const Route = createFileRoute("/_protected/_main/posts/")({
    component: Posts,
});

function Posts() {
    const { data, isPending, isError } = usePosts();
    const [showNewPostDrawer, setShowNewPostDrawer] = useState(false);
    if (isPending) return <LoadingPage />;
    if (isError) return <div>出错啦</div>;
    return (
        <>
            <section className="relative h-full divide-y divide-green-400 overflow-auto">
                {data.map((post) => (
                    <Post key={post.id} {...post} />
                ))}
            </section>

            <Drawer
                open={showNewPostDrawer}
                onOpenChange={setShowNewPostDrawer}
            >
                <div className="fixed bottom-[70px] right-4">
                    <Button
                        className="size-14 rounded-full p-0"
                        onClick={() => setShowNewPostDrawer(true)}
                    >
                        <Pencil className="size-[50%]" />
                    </Button>
                </div>
                <DrawerContent>
                    <NewPost
                        onClose={() => setShowNewPostDrawer(false)}
                        onSuccess={() => setShowNewPostDrawer(false)}
                    />
                </DrawerContent>
            </Drawer>
        </>
    );
}
