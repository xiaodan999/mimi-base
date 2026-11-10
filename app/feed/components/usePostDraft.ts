import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { toast } from "sonner";

import {
    compressVideoForUpload,
    VIDEO_COMPRESS_MIN_BYTES,
} from "@/lib/compressVideo";
import { getFileUrl } from "@/lib/pb";
import { formatFileSize, VIDEO_ACCEPT, videoFileError } from "@/lib/postMedia";
import { preparePhoto } from "@/lib/prepareImage";
import showFilePicker, { showFilesPicker } from "@/lib/showFilePicker";
import { toastPromise } from "@/lib/toast-promise";

import {
    type PostData,
    type PostLayout,
    useNewPostMutation,
    useUpdatePostMutation,
} from "../data";
import { buildPostImagesFields, buildPostVideoFields } from "../utils";

export type PreviewImage =
    | { kind: "file"; file: File; thumb: File | null; url: string }
    | { kind: "existing"; name: string; url: string; thumb?: string };

export type PreviewVideo =
    | {
          kind: "file";
          file: File;
          url: string;
          name: string;
          sizeLabel: string;
      }
    | { kind: "existing"; name: string; url: string };

export const MAX_IMAGES = 9;

/** Read a preview as a blob; uploaded images live behind protected URLs. */
export async function previewImageBlob(image: PreviewImage): Promise<Blob> {
    if (image.kind === "file") return image.file;
    const response = await fetch(image.url);
    if (!response.ok) throw new Error("照片读取失败");
    return response.blob();
}

type UsePostDraftArgs = {
    open: boolean;
    editing: PostData | null;
    onOpenChange: (open: boolean) => void;
};

/**
 * Owns the composer's draft state: text, layout, picked images (and their
 * object URLs), publishing/preparing flags, and the seed/reset/publish flows.
 * Keeping this in one hook lets the form, image grid and AI caption task share
 * a single draft without threading a dozen setters through the tree.
 */
export function usePostDraft({
    open,
    editing,
    onOpenChange,
}: UsePostDraftArgs) {
    const newPostMutation = useNewPostMutation();
    const updatePostMutation = useUpdatePostMutation();
    const [mode, setMode] = useState<"new" | "edit">("new");
    const [text, setText] = useState("");
    const [layout, setLayout] = useState<PostLayout>("moments");
    const [images, setImages] = useState<PreviewImage[]>([]);
    const [video, setVideo] = useState<PreviewVideo | null>(null);
    const [pendingCount, setPendingCount] = useState(0);
    const [publishing, setPublishing] = useState(false);
    const [preparing, setPreparing] = useState(false);
    const [previewIndex, setPreviewIndex] = useState<number | null>(null);
    /** Which draft (or which post) the current form state was seeded from. */
    const [seededKey, setSeededKey] = useState<string | null>(null);
    const previewUrls = useRef<string[]>([]);

    // Release the local object URLs when the composer unmounts.
    useEffect(() => {
        const urls = previewUrls;
        return () => {
            urls.current.forEach((url) => URL.revokeObjectURL(url));
            urls.current = [];
        };
    }, []);

    // Seed a new draft, or the post being edited, before the sheet paints.
    // That way reopening for a different post never flashes the old draft.
    useLayoutEffect(() => {
        if (!open) return;
        const key = editing ? `edit:${editing.id}` : "new";
        if (seededKey === key) return;

        previewUrls.current.forEach((url) => URL.revokeObjectURL(url));
        previewUrls.current = [];
        setPreviewIndex(null);
        setPendingCount(0);
        setMode(editing ? "edit" : "new");

        if (editing) {
            const fileRecord = {
                id: editing.id,
                collectionId: editing.collectionId,
            };
            setText(editing.text);
            setLayout(editing.layout);
            setImages(
                editing.images.map((image) => ({
                    kind: "existing" as const,
                    name: image.name,
                    thumb: image.thumb,
                    url: getFileUrl(fileRecord, image.name),
                })),
            );
            const videoName = editing.videos[0];
            setVideo(
                videoName
                    ? {
                          kind: "existing",
                          name: videoName,
                          url: getFileUrl(fileRecord, videoName),
                      }
                    : null,
            );
        } else {
            setText("");
            setLayout("moments");
            setImages([]);
            setVideo(null);
        }
        setSeededKey(key);
    }, [open, editing, seededKey]);

    const resetDraft = () => {
        previewUrls.current.forEach((url) => URL.revokeObjectURL(url));
        previewUrls.current = [];
        setText("");
        setLayout("moments");
        setImages([]);
        setVideo(null);
        setPendingCount(0);
        setPreviewIndex(null);
    };

    const pickImages = async () => {
        if (preparing || publishing) return;
        if (video) {
            toast.info("照片和视频只能选一种，先移除视频吧");
            return;
        }

        const remaining = MAX_IMAGES - images.length;
        if (remaining <= 0) {
            toast.info(`最多只能选择 ${MAX_IMAGES} 张图片`);
            return;
        }

        let picked: File[];
        try {
            picked = await showFilesPicker("image/*");
        } catch {
            // The user cancelled the file picker.
            return;
        }

        if (picked.length > remaining) {
            toast.info(`最多只能选择 ${MAX_IMAGES} 张图片`);
        }

        const selected = picked.slice(0, remaining);
        setPreparing(true);
        setPendingCount(selected.length);
        try {
            const results = await toastPromise(
                Promise.allSettled(selected.map((file) => preparePhoto(file))),
                {
                    loading: "压缩图片中...",
                    success: (settled) =>
                        settled.some((result) => result.status === "fulfilled")
                            ? "压缩完成"
                            : "没有可用的图片",
                    error: "图片压缩失败",
                },
            );

            const prepared = results.flatMap((result) =>
                result.status === "fulfilled" ? [result.value] : [],
            );
            if (prepared.length > 0 && prepared.length < selected.length) {
                toast.error(
                    `${selected.length - prepared.length} 张图片无法处理，已跳过`,
                );
            }

            const next = prepared.map(({ main, thumb }) => {
                const url = URL.createObjectURL(main);
                previewUrls.current.push(url);
                return { kind: "file" as const, file: main, thumb, url };
            });
            setImages((previous) => [...previous, ...next]);
        } catch {
            // toastPromise already surfaced the error.
        } finally {
            setPreparing(false);
            setPendingCount(0);
        }
    };

    const removeImage = (index: number) => {
        setImages((previous) => {
            const target = previous[index];
            if (target?.kind === "file") {
                URL.revokeObjectURL(target.url);
                previewUrls.current = previewUrls.current.filter(
                    (url) => url !== target.url,
                );
            }
            return previous.filter((_, imageIndex) => imageIndex !== index);
        });
    };

    const pickVideo = async () => {
        if (preparing || publishing) return;
        if (images.length > 0) {
            toast.info("照片和视频只能选一种，先移除照片吧");
            return;
        }

        let file: File;
        try {
            file = await showFilePicker(VIDEO_ACCEPT);
        } catch {
            // The user cancelled the file picker.
            return;
        }

        const error = videoFileError(file);
        if (error) {
            toast.error(error);
            return;
        }

        if (video?.kind === "file") {
            URL.revokeObjectURL(video.url);
            previewUrls.current = previewUrls.current.filter(
                (url) => url !== video.url,
            );
        }
        const url = URL.createObjectURL(file);
        previewUrls.current.push(url);
        setVideo({
            kind: "file",
            file,
            url,
            name: file.name,
            sizeLabel: formatFileSize(file.size),
        });
    };

    const removeVideo = () => {
        if (video?.kind === "file") {
            URL.revokeObjectURL(video.url);
            previewUrls.current = previewUrls.current.filter(
                (url) => url !== video.url,
            );
        }
        setVideo(null);
    };

    const publish = async () => {
        const value = text.trim();
        if (
            (!value && images.length === 0 && !video) ||
            publishing ||
            preparing
        )
            return;

        const { keep, files, keepThumbs, thumbs } =
            buildPostImagesFields(images);
        setPublishing(true);
        let compressionToast: ReturnType<typeof toast.loading> | undefined;
        try {
            // Compress before the PocketBase upload so the stored file is
            // small from the first view. A missing/failing ffmpeg returns the
            // original file and the post still publishes normally.
            let videoFile = video?.kind === "file" ? video.file : null;
            if (videoFile) {
                if (videoFile.size >= VIDEO_COMPRESS_MIN_BYTES) {
                    compressionToast = toast.loading("正在压缩视频…");
                }
                const result = await compressVideoForUpload(videoFile).catch(
                    () => ({
                        file: videoFile,
                        compressed: false,
                        reason: "error",
                    }),
                );
                videoFile = result.file;
                if (compressionToast !== undefined) {
                    if (result.compressed) {
                        toast.success("视频已压缩，正在上传", {
                            id: compressionToast,
                        });
                    } else if (result.reason === "not_smaller") {
                        toast.info("压缩后没有变小，按原画质上传", {
                            id: compressionToast,
                        });
                    } else {
                        toast.info("视频压缩暂不可用，按原画质上传", {
                            id: compressionToast,
                        });
                    }
                    compressionToast = undefined;
                }
            }
            const videoFields = buildPostVideoFields(
                video
                    ? video.kind === "file"
                        ? { kind: "file", file: videoFile ?? video.file }
                        : { kind: "existing", name: video.name }
                    : null,
            );

            if (editing) {
                await toastPromise(
                    updatePostMutation.mutateAsync({
                        id: editing.id,
                        text: value,
                        layout,
                        keepImages: keep,
                        keepThumbs,
                        files,
                        thumbs,
                        keepVideos: videoFields.keep,
                        videoFiles: videoFields.files,
                    }),
                    {
                        loading: "保存中...",
                        success: "已保存",
                        error: "保存失败",
                    },
                );
                // Keep the content on screen while the sheet slides away; the
                // next open re-seeds from the saved record.
                setSeededKey(null);
            } else {
                await toastPromise(
                    newPostMutation.mutateAsync({
                        text: value,
                        layout,
                        images: files,
                        thumbs,
                        videos: videoFields.files,
                    }),
                    {
                        loading: "发布中...",
                        success: "发布成功",
                        error: "发布失败",
                    },
                );
                resetDraft();
                setSeededKey(null);
            }
            onOpenChange(false);
        } catch {
            // toastPromise already surfaced the error.
        } finally {
            if (compressionToast !== undefined) toast.dismiss(compressionToast);
            setPublishing(false);
        }
    };

    const canPublish =
        (text.trim().length > 0 || images.length > 0 || video !== null) &&
        !publishing &&
        !preparing;
    const showImages = images.length > 0 || preparing;
    const showVideo = video !== null;
    const isEditing = mode === "edit";

    return {
        mode,
        isEditing,
        text,
        setText,
        layout,
        setLayout,
        images,
        video,
        pendingCount,
        publishing,
        preparing,
        previewIndex,
        setPreviewIndex,
        seededKey,
        setSeededKey,
        canPublish,
        showImages,
        showVideo,
        pickImages,
        removeImage,
        pickVideo,
        removeVideo,
        publish,
    };
}

export type PostDraft = ReturnType<typeof usePostDraft>;
