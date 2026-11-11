import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { toast } from "sonner";

import {
    compressVideoForUpload,
    VIDEO_COMPRESS_MIN_BYTES,
} from "@/lib/compressVideo";
import { getFileUrl } from "@/lib/pb";
import {
    formatFileSize,
    isVideoCandidate,
    MAX_POST_MEDIA,
    MEDIA_ACCEPT,
    readVideoSize,
    videoFileError,
} from "@/lib/postMedia";
import { preparePhoto } from "@/lib/prepareImage";
import { showFilesPicker } from "@/lib/showFilePicker";
import { toastPromise } from "@/lib/toast-promise";

import {
    type PostData,
    type PostLayout,
    useNewPostMutation,
    useUpdatePostMutation,
} from "../data";
import {
    buildPostMediaFields,
    type ComposerMediaRef,
    moveArrayItem,
} from "../utils";

/**
 * One composer media item: a photo or a video, already uploaded (editing) or
 * still a local file. A single ordered list lets the user mix and reorder
 * both kinds in one grid.
 */
export type PreviewMedia =
    | {
          type: "image";
          kind: "file";
          file: File;
          thumb: File | null;
          url: string;
          width: number;
          height: number;
      }
    | {
          type: "image";
          kind: "existing";
          name: string;
          url: string;
          thumb?: string;
          width?: number;
          height?: number;
      }
    | {
          type: "video";
          kind: "file";
          file: File;
          url: string;
          name: string;
          sizeLabel: string;
          width: number;
          height: number;
      }
    | {
          type: "video";
          kind: "existing";
          name: string;
          url: string;
          width?: number;
          height?: number;
      };

export type PreviewImageMedia = Extract<PreviewMedia, { type: "image" }>;
export type PreviewVideoMedia = Extract<PreviewMedia, { type: "video" }>;

/** Read a preview as a blob; uploaded images live behind protected URLs. */
export async function previewImageBlob(
    image: PreviewImageMedia,
): Promise<Blob> {
    if (image.kind === "file") return image.file;
    const response = await fetch(image.url);
    if (!response.ok) throw new Error("照片读取失败");
    return response.blob();
}

/** How many photos the draft holds (AI captions only look at photos). */
export function countImages(media: PreviewMedia[]): number {
    return media.filter((item) => item.type === "image").length;
}

type UsePostDraftArgs = {
    open: boolean;
    editing: PostData | null;
    onOpenChange: (open: boolean) => void;
};

/**
 * Owns the composer's draft state: text, layout, one mixed media list (and its
 * object URLs), publishing/preparing flags, and the seed/reset/publish flows.
 * Keeping this in one hook lets the form, the media grid and the AI caption
 * task share a single draft without threading a dozen setters through the
 * tree.
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
    const [layout, setLayout] = useState<PostLayout>("twitter");
    const [media, setMedia] = useState<PreviewMedia[]>([]);
    const [pendingCount, setPendingCount] = useState(0);
    const [publishing, setPublishing] = useState(false);
    const [preparing, setPreparing] = useState(false);
    /** Index among the draft's photos, for the full-screen image viewer. */
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
            setMedia(
                editing.media.map((item) =>
                    item.kind === "image"
                        ? {
                              type: "image" as const,
                              kind: "existing" as const,
                              name: item.name,
                              thumb: item.thumb,
                              url: getFileUrl(fileRecord, item.name),
                              width: item.width,
                              height: item.height,
                          }
                        : {
                              type: "video" as const,
                              kind: "existing" as const,
                              name: item.name,
                              url: getFileUrl(fileRecord, item.name),
                              width: item.width,
                              height: item.height,
                          },
                ),
            );
        } else {
            setText("");
            setLayout("twitter");
            setMedia([]);
        }
        setSeededKey(key);
    }, [open, editing, seededKey]);

    const resetDraft = () => {
        previewUrls.current.forEach((url) => URL.revokeObjectURL(url));
        previewUrls.current = [];
        setText("");
        setLayout("twitter");
        setMedia([]);
        setPendingCount(0);
        setPreviewIndex(null);
    };

    /**
     * One picker for both kinds. Photos go through the existing compressor;
     * videos are validated here (size/container) and get a local preview. The
     * selected files are appended in pick order, so the first grid order
     * matches what the user chose.
     */
    const pickMedia = async () => {
        if (preparing || publishing) return;

        const remaining = MAX_POST_MEDIA - media.length;
        if (remaining <= 0) {
            toast.info(`一条动态最多 ${MAX_POST_MEDIA} 个媒体`);
            return;
        }

        let picked: File[];
        try {
            picked = await showFilesPicker(MEDIA_ACCEPT);
        } catch {
            // The user cancelled the file picker.
            return;
        }

        if (picked.length > remaining) {
            toast.info(`一条动态最多 ${MAX_POST_MEDIA} 个媒体`);
        }

        const selected = picked.slice(0, remaining);
        let rejected = 0;
        let firstRejectedName = "";
        let firstRejectedError = "";
        const accepted: File[] = [];
        for (const file of selected) {
            if (!isVideoCandidate(file)) {
                accepted.push(file);
                continue;
            }
            const error = videoFileError(file);
            if (error) {
                rejected += 1;
                if (!firstRejectedError) {
                    firstRejectedError = error;
                    firstRejectedName = file.name;
                }
                continue;
            }
            accepted.push(file);
        }
        if (rejected > 0) {
            toast.error(
                rejected === 1
                    ? `${firstRejectedName}：${firstRejectedError}`
                    : `已跳过 ${rejected} 个不支持的视频`,
            );
        }
        if (accepted.length === 0) return;

        const imageFiles = accepted.filter((file) => !isVideoCandidate(file));
        setPreparing(true);
        setPendingCount(imageFiles.length);
        try {
            const imageResults =
                imageFiles.length > 0
                    ? await toastPromise(
                          Promise.allSettled(
                              imageFiles.map((file) => preparePhoto(file)),
                          ),
                          {
                              loading: "压缩图片中...",
                              success: (settled) =>
                                  settled.some(
                                      (result) => result.status === "fulfilled",
                                  )
                                      ? "压缩完成"
                                      : "没有可用的图片",
                              error: "图片压缩失败",
                          },
                      )
                    : [];

            const preparedByFile = new Map<
                File,
                Awaited<ReturnType<typeof preparePhoto>>
            >();
            imageFiles.forEach((file, index) => {
                const result = imageResults[index];
                if (result?.status === "fulfilled") {
                    preparedByFile.set(file, result.value);
                }
            });
            const skipped = imageFiles.length - preparedByFile.size;
            if (preparedByFile.size > 0 && skipped > 0) {
                toast.error(`${skipped} 张图片无法处理，已跳过`);
            }

            const previews: PreviewMedia[] = [];
            for (const file of accepted) {
                if (isVideoCandidate(file)) {
                    const url = URL.createObjectURL(file);
                    previewUrls.current.push(url);
                    previews.push({
                        type: "video",
                        kind: "file",
                        file,
                        url,
                        name: file.name,
                        sizeLabel: formatFileSize(file.size),
                        width: 0,
                        height: 0,
                    });
                    // Read the intrinsic size in the background so the feed
                    // can reserve the right box; the preview appears now.
                    void readVideoSize(file).then((size) => {
                        if (!size) return;
                        setMedia((previous) =>
                            previous.map((item) =>
                                item.type === "video" &&
                                item.kind === "file" &&
                                item.file === file
                                    ? {
                                          ...item,
                                          width: size.width,
                                          height: size.height,
                                      }
                                    : item,
                            ),
                        );
                    });
                    continue;
                }

                const prepared = preparedByFile.get(file);
                if (!prepared) continue;
                const url = URL.createObjectURL(prepared.main);
                previewUrls.current.push(url);
                previews.push({
                    type: "image",
                    kind: "file",
                    file: prepared.main,
                    thumb: prepared.thumb,
                    url,
                    width: prepared.width,
                    height: prepared.height,
                });
            }
            setMedia((previous) => [...previous, ...previews]);
        } catch {
            // toastPromise already surfaced the error.
        } finally {
            setPreparing(false);
            setPendingCount(0);
        }
    };

    const removeMedia = (index: number) => {
        setMedia((previous) => {
            const target = previous[index];
            if (target && target.kind === "file") {
                URL.revokeObjectURL(target.url);
                previewUrls.current = previewUrls.current.filter(
                    (url) => url !== target.url,
                );
            }
            return previous.filter((_, itemIndex) => itemIndex !== index);
        });
    };

    /** Move one photo or video in the visual order. */
    const moveMedia = (from: number, to: number) => {
        setMedia((previous) => moveArrayItem(previous, from, to));
    };

    const publish = async () => {
        const value = text.trim();
        if ((!value && media.length === 0) || publishing || preparing) return;

        setPublishing(true);
        let compressionToast: ReturnType<typeof toast.loading> | undefined;
        try {
            // Compress each newly picked video before the PocketBase upload so
            // every stored file is small from the first view. The calls run
            // one at a time (ffmpeg is CPU-bound on the API); a missing or
            // failing ffmpeg returns the original file and the post still
            // publishes normally.
            const newVideos = media.filter(
                (item) => item.type === "video" && item.kind === "file",
            );
            const replaced = new Map<File, File>();
            for (const [index, item] of newVideos.entries()) {
                if (item.type !== "video" || item.kind !== "file") continue;
                const file = item.file;
                if (file.size >= VIDEO_COMPRESS_MIN_BYTES) {
                    compressionToast = toast.loading(
                        newVideos.length > 1
                            ? `正在压缩视频 ${index + 1}/${newVideos.length}…`
                            : "正在压缩视频…",
                    );
                }
                const result = await compressVideoForUpload(file).catch(() => ({
                    file,
                    compressed: false,
                    reason: "error",
                }));
                replaced.set(file, result.file);
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

            const fields = buildPostMediaFields(
                media.map((item) => toComposerRef(item, replaced)),
            );

            if (editing) {
                await toastPromise(
                    updatePostMutation.mutateAsync({
                        id: editing.id,
                        text: value,
                        layout,
                        media: fields,
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
                        media: fields,
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
        (text.trim().length > 0 || media.length > 0) &&
        !publishing &&
        !preparing;
    const isEditing = mode === "edit";

    return {
        mode,
        isEditing,
        text,
        setText,
        layout,
        setLayout,
        media,
        pendingCount,
        publishing,
        preparing,
        previewIndex,
        setPreviewIndex,
        seededKey,
        setSeededKey,
        canPublish,
        pickMedia,
        removeMedia,
        moveMedia,
        publish,
    };
}

/** Map a seeded/picked preview to the pure shape the mutation builder takes. */
function toComposerRef(
    media: PreviewMedia,
    replaced: Map<File, File>,
): ComposerMediaRef {
    if (media.type === "image") {
        return media.kind === "file"
            ? {
                  type: "image",
                  kind: "file",
                  file: media.file,
                  thumb: media.thumb,
                  width: media.width,
                  height: media.height,
              }
            : {
                  type: "image",
                  kind: "existing",
                  name: media.name,
                  thumb: media.thumb,
                  width: media.width,
                  height: media.height,
              };
    }
    return media.kind === "file"
        ? {
              type: "video",
              kind: "file",
              file: replaced.get(media.file) ?? media.file,
              width: media.width,
              height: media.height,
          }
        : {
              type: "video",
              kind: "existing",
              name: media.name,
              width: media.width,
              height: media.height,
          };
}

export type PostDraft = ReturnType<typeof usePostDraft>;
