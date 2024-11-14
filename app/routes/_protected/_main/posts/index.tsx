import { Fragment, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Pencil } from "lucide-react";

import LoadingPage from "@/components/LoadingPage";
import { Button } from "@/components/ui/button";
import {
    Drawer,
    DrawerContent,
    DrawerDescription,
    DrawerHeader,
    DrawerTitle,
} from "@/components/ui/drawer";
import { LoadingButton } from "@/components/ui/loading-button";

import NewPost from "./-components/new-post";
import Post from "./-components/post";
import { usePostsInfinite } from "./-data";

export const Route = createFileRoute("/_protected/_main/posts/")({
    component: Posts,
});

function Posts() {
    const {
        data,
        isPending,
        isError,
        fetchNextPage,
        hasNextPage,
        isFetchingNextPage,
    } = usePostsInfinite(8);
    const [showNewPostDrawer, setShowNewPostDrawer] = useState(false);
    if (isPending) return <LoadingPage />;
    if (isError) return <div>出错啦</div>;
    return (
        <>
            <section className="relative h-full overflow-auto">
                <div className="divide-y divide-green-400">
                    {data.pages.map((page, i) => (
                        <Fragment key={i}>
                            {page.posts.map((post) => (
                                <Post key={post.id} {...post} />
                            ))}
                        </Fragment>
                    ))}
                </div>

                <div className="mb-4 flex justify-center">
                    {!hasNextPage && <p>到底了...</p>}
                    {hasNextPage && (
                        <LoadingButton
                            disabled={isFetchingNextPage}
                            loading={isFetchingNextPage}
                            onClick={() => fetchNextPage()}
                        >
                            加载更多
                        </LoadingButton>
                    )}
                </div>
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
                    <DrawerHeader className="hidden">
                        <DrawerTitle>Create a New Post</DrawerTitle>
                        <DrawerDescription>
                            Write down your post
                        </DrawerDescription>
                    </DrawerHeader>
                    <NewPost
                        onClose={() => setShowNewPostDrawer(false)}
                        onSuccess={() => setShowNewPostDrawer(false)}
                    />
                </DrawerContent>
            </Drawer>
        </>
    );
}
