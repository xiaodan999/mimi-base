import { Fragment, useEffect } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import { PlusCircle } from "lucide-react";
import { useInView } from "react-intersection-observer";

// eslint-disable-next-line import/order
import usePhotos, { type PhotoData } from "./-usePhotos";

import LoadingPage from "@/components/LoadingPage";
import TouXiang from "@/components/TouXiang";
import { Button } from "@/components/ui/button";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { useAuth } from "@/lib/auth";
import compressImage from "@/lib/compressImage";
import { formatDate } from "@/lib/date";
import pb, { getUserAvatarUrl, getUserCircleUrl } from "@/lib/pb";
import showFilePicker from "@/lib/showFilePicker";
import { toastPromise } from "@/lib/toast-promise";

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
                    touXiangUrl={getUserAvatarUrl(user)}
                    circleUrl={getUserCircleUrl(user)}
                    size={32}
                />
                <div className="font-light">{user.user_name}</div>
            </div>

            <div className="flex justify-center">
                <div className="relative h-[330px] w-[250px] overflow-hidden rounded-md bg-green-100">
                    <img
                        className="aspect-[3/4] h-full w-full object-cover transition-all hover:scale-105"
                        src={url}
                        alt="life"
                    />
                </div>

                {/* more images ... */}
            </div>

            <div className="mt-2 text-right text-sm text-blue-500 hover:underline hover:opacity-70">
                <Link to="/secret">
                    <time dateTime={created_at}>{formatDate(created_at)}</time>
                </Link>
            </div>
        </div>
    );
}

function Header() {
    const { user } = useAuth();
    const queryClient = useQueryClient();
    const mutation = useMutation({
        mutationKey: ["photos"],
        mutationFn: async () => {
            // 1. 让用户选择图片
            const originalFile = await toastPromise(showFilePicker("image/*"), {
                loading: "获取图片中...",
                success: "成功获取图片",
                error: "获取图片失败",
            });

            const file = await toastPromise(
                compressImage(originalFile, {
                    quality: 0.7,
                }),
                {
                    loading: "压缩图片中...",
                    success: "压缩图片完成",
                    error: "压缩图片失败",
                },
            );

            // 创建记录的同时上传文件 (PocketBase 一次调用同时保存记录和图片)
            const type = file.type || "image/webp";
            const ext = type.split("/")[1] || "webp";
            const formData = new FormData();
            formData.append("user_id", user.id);
            formData.append(
                "photo",
                new File([file], `${Date.now()}.${ext}`, { type }),
            );

            await toastPromise(
                pb.collection("tu_pian_xin_xi").create(formData),
                {
                    loading: "上传图片中...",
                    success: "上传图片成功",
                    error: (e) => `上传图片失败. ${e}`,
                },
            );
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["photos"] });
        },
    });

    return (
        <section className="flex items-center justify-between p-2">
            <h1 className="text-3xl">小丹和小海的照片</h1>
            <Button
                type="button"
                className="size-13 p-1"
                variant="ghost"
                onClick={() => mutation.mutate()}
                disabled={mutation.isPending}
            >
                {mutation.isPending ? (
                    <LoadingSpinner className="size-10" />
                ) : (
                    <PlusCircle className="size-10" />
                )}
            </Button>
        </section>
    );
}
