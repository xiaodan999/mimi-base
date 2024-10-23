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
import showFilePicker from "@/lib/showFilePicker";
import supabase from "@/lib/supabase-client";
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
                    touXiangUrl={user.tou_xiang}
                    circleUrl={user.circle}
                    size={32}
                />
                <div className="font-light">{user.user_name}</div>
            </div>

            <div className="flex justify-center">
                <div className="relative h-[330px] w-[250px] overflow-hidden rounded-md bg-green-100">
                    <img
                        className="h-full w-full aspect-[3/4] object-cover transition-all hover:scale-105"
                        src={url}
                        alt="life"
                    />
                </div>

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

            const path = `photos/${user.id}/${Date.now()}.webp`;
            await toastPromise(
                supabase.storage
                    .from("hao-duo-zhao-pian")
                    .upload(path, file, { cacheControl: "31536000" })
                    .then(({ error, data }) => {
                        if (error) throw error;
                        return data;
                    }),
                {
                    loading: "上传图片中...",
                    success: "上传图片成功",
                    error: (e) => `上传图片失败. ${e}`,
                },
            );

            await toastPromise(
                // @ts-expect-error silly supabase
                supabase
                    .from("tu-pian-xin-xi")
                    .insert([{ user_id: user.id, photo: path }])
                    .then(({ data, error }) => {
                        if (error) throw error;
                        return data;
                    }),
                {
                    loading: "记录图片信息中...",
                    success: "记录图片信息成功",
                    error: "记录图片信息失败",
                },
            );
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["photos"] });
        },
    });

    return (
        <section className="flex justify-between items-center p-2">
            <h1 className="text-3xl">小丹和小海的照片</h1>
            <Button
                type="button"
                className="p-1 size-13"
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
