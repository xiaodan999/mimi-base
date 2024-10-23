import { Fragment, useEffect } from "react";
import * as Avatar from "@radix-ui/react-avatar";
import { Link, createFileRoute } from "@tanstack/react-router";
import { PlusCircle } from "lucide-react";
import { useInView } from "react-intersection-observer";

// eslint-disable-next-line import/order
import usePhotos, { type PhotoData } from "./-usePhotos";

import LoadingPage from "@/components/LoadingPage";
import TouXiang from "@/components/TouXiang";
import { Button } from "@/components/ui/button";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDate } from "@/lib/date";

export const Route = createFileRoute("/_protected/_main/photos/")({
    component: Page,
});

function Page() {
    const {
        data,
        hasNextPage,
        fetchNextPage,
        status,
        error,
        isFetchingNextPage,
        isFetching,
    } = usePhotos();
    const { ref, inView } = useInView();

    useEffect(() => {
        if (inView) {
            fetchNextPage();
        }
    }, [fetchNextPage, inView]);

    return (
        <div className="pb-12">
            <Header />

            {status === "pending" ? (
                <LoadingPage />
            ) : status === "error" ? (
                <span>Error: {error.message}</span>
            ) : (
                <>
                    <div className="flex flex-col divide-y divide-cyan-500">
                        {data.pages.map((page, i) => (
                            <Fragment key={data.pageParams[i] as string}>
                                {page.photos.map((photo) => (
                                    <Fragment key={photo.id}>
                                        <Photo {...photo} />
                                    </Fragment>
                                ))}
                            </Fragment>
                        ))}
                    </div>

                    <div className="flex flex-col items-center">
                        <Button
                            ref={ref}
                            className="text-blue-400"
                            size="lg"
                            variant="ghost"
                            onClick={() => fetchNextPage()}
                            disabled={!hasNextPage || isFetchingNextPage}
                        >
                            {isFetchingNextPage ? (
                                <LoadingSpinner />
                            ) : hasNextPage ? (
                                "更多"
                            ) : (
                                "到底啦..."
                            )}
                        </Button>
                        <div className="text-blue-400">
                            {isFetching && !isFetchingNextPage
                                ? "刷新中..."
                                : null}
                        </div>
                    </div>
                    {/* <pre>{JSON.stringify(data, null, 2)}</pre> */}
                </>
            )}
        </div>
    );
}

function Photo({ user, url, created_at }: PhotoData) {
    return (
        <div className="p-2">
            <div className="flex items-center gap-1">
                <TouXiang
                    touXiangUrl={user.tou_xiang}
                    circleUrl={user.circle}
                    size={32}
                />
                <div className="font-light">{user.user_name}</div>
            </div>

            <div className="flex justify-center">
                <Avatar.Root className="relative h-[330px] w-[250px] overflow-hidden rounded-md">
                    <Avatar.Image
                        className="h-full w-full aspect-[3/4] object-cover transition-all hover:scale-105"
                        src={url}
                        alt="life"
                    />
                    <Avatar.Fallback className="h-full w-full">
                        <Skeleton className="h-full w-full" />
                    </Avatar.Fallback>
                </Avatar.Root>
                {/* more images ... */}
            </div>

            <div className="text-right text-sm mt-2 text-blue-500 hover:underline hover:opacity-70">
                <Link to="/secret">
                    <time dateTime={created_at}>{formatDate(created_at)}</time>
                </Link>
            </div>
        </div>
    );
}

function Header() {
    return (
        <section className="flex justify-between items-center p-2">
            <h1 className="text-3xl">小丹和小海的照片</h1>
            <Button size="icon" variant="ghost">
                <PlusCircle className="size-8" />
            </Button>
        </section>
    );
}
