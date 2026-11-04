import { useEffect, useState, type ReactNode } from "react";
import { Ban, Plus, X } from "lucide-react";
import { toast } from "sonner";

import TouXiang, { CircleRing } from "@/components/TouXiang";
import {
    CIRCLE_PRESETS,
    DEFAULT_RING,
    NO_RING,
} from "@/components/TouXiang/presets";
import { Button } from "@/components/ui/button";
import {
    Drawer,
    DrawerClose,
    DrawerContent,
    DrawerDescription,
    DrawerFooter,
    DrawerHeader,
    DrawerTitle,
} from "@/components/ui/drawer";
import { type User } from "@/lib/auth";
import compressImage, { canEncodeWebp } from "@/lib/compressImage";
import { getFileUrl, getUserAvatarUrl, getUserCircleUrl } from "@/lib/pb";
import showFilePicker from "@/lib/showFilePicker";
import { toastPromise } from "@/lib/toast-promise";
import { cn } from "@/lib/utils";

import {
    useDeleteRing,
    useMyRings,
    useSetRing,
    useUploadRing,
    type MyRing,
} from "../-data";
import {
    isSameSelection,
    ringPayload,
    selectionFromUser,
    type RingSelection,
} from "./ring-selection";

type RingPickerProps = {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    user: User;
};

type RingPreview = { circleUrl: string; preset: string };

function RingThumb({ circleUrl, preset }: RingPreview) {
    return (
        <span className="relative block h-12 w-12">
            <span className="absolute inset-0 rounded-full bg-gradient-to-br from-muted to-muted-foreground/25" />
            <CircleRing
                circleUrl={circleUrl}
                preset={preset}
                className="absolute inset-0 h-full w-full"
            />
        </span>
    );
}

function Tile({
    active,
    label,
    onClick,
    children,
}: {
    active: boolean;
    label: string;
    onClick: () => void;
    children: ReactNode;
}) {
    return (
        <button
            type="button"
            aria-pressed={active}
            className={cn(
                "flex flex-col items-center gap-1.5 rounded-2xl p-2 transition-colors",
                active
                    ? "bg-primary/10 ring-2 ring-primary"
                    : "hover:bg-accent",
            )}
            onClick={onClick}
        >
            {children}
            <span className="max-w-full truncate text-[11px] font-medium">
                {label}
            </span>
        </button>
    );
}

export default function RingPicker({
    open,
    onOpenChange,
    user,
}: RingPickerProps) {
    const { data: rings = [] } = useMyRings();
    const setRing = useSetRing();
    const uploadRing = useUploadRing();
    const deleteRing = useDeleteRing();

    const [draft, setDraft] = useState<RingSelection>(() =>
        selectionFromUser(user),
    );
    const [uploadedUrl, setUploadedUrl] = useState("");

    useEffect(() => {
        if (!open) return;
        setDraft(selectionFromUser(user));
        setUploadedUrl("");
    }, [open, user]);

    const previewFor = (selection: RingSelection): RingPreview => {
        if (selection.kind === "none") {
            return { circleUrl: "", preset: NO_RING };
        }
        if (selection.kind === "preset") {
            return { circleUrl: "", preset: selection.key };
        }
        if (selection.kind === "custom") {
            const ring = rings.find((item) => item.id === selection.id);
            const circleUrl = ring
                ? getFileUrl(ring, ring.image, "200x200")
                : selection.id === user.circle
                  ? getUserCircleUrl(user)
                  : uploadedUrl;
            return { circleUrl, preset: "" };
        }
        return { circleUrl: "", preset: DEFAULT_RING };
    };

    const handleApply = async () => {
        try {
            await toastPromise(setRing.mutateAsync(ringPayload(draft)), {
                loading: "保存头像框中...",
                success: "头像框已更新",
                error: "头像框保存失败",
            });
            onOpenChange(false);
        } catch {
            // toastPromise already reported the failure.
        }
    };

    const handleUpload = async () => {
        let original: File | null = null;
        try {
            original = await showFilePicker("image/*").catch((error) => {
                if (
                    error instanceof Error &&
                    /closed the file picker/i.test(error.message)
                ) {
                    return null;
                }
                throw error;
            });
        } catch {
            toast.error("获取图片失败");
            return;
        }
        if (!original) return;

        try {
            const compressed = await toastPromise(
                compressImage(original, {
                    quality: 0.92,
                    maxWidth: 1024,
                    maxHeight: 1024,
                    // Rings need transparency; JPEG would fill the hole.
                    mimeType: canEncodeWebp() ? "image/webp" : "image/png",
                }),
                {
                    loading: "压缩头像框中...",
                    success: "压缩完成",
                    error: "压缩头像框失败",
                },
            );

            const type = compressed.type || "image/webp";
            const ext = type.split("/")[1] || "webp";
            const file = new File([compressed], `${Date.now()}.${ext}`, {
                type,
            });
            const record = await toastPromise(uploadRing.mutateAsync(file), {
                loading: "上传头像框中...",
                success: "上传成功",
                error: "上传头像框失败",
            });

            setUploadedUrl(getFileUrl(record, record.image as string));
            setDraft({ kind: "custom", id: record.id });
        } catch {
            // toastPromise already reported the failure.
        }
    };

    const handleDelete = async (ring: MyRing) => {
        if (!window.confirm(`删除头像框「${ring.name}」？`)) return;

        try {
            await toastPromise(deleteRing.mutateAsync(ring), {
                loading: "删除中...",
                success: "头像框已删除",
                error: "删除头像框失败",
            });
            if (draft.kind === "custom" && draft.id === ring.id) {
                setDraft({ kind: "default" });
            }
        } catch {
            // toastPromise already reported the failure.
        }
    };

    const preview = previewFor(draft);

    return (
        <Drawer open={open} onOpenChange={onOpenChange}>
            <DrawerContent className="max-h-[88dvh]">
                <DrawerHeader>
                    <DrawerTitle>选择头像框</DrawerTitle>
                    <DrawerDescription>
                        内置头像框会随头像尺寸缩放，无需单独上传。
                    </DrawerDescription>
                </DrawerHeader>

                <div className="flex flex-col items-center gap-1 pb-3">
                    <TouXiang
                        size={96}
                        touXiangUrl={getUserAvatarUrl(user)}
                        {...preview}
                    />
                    <span className="text-xs text-muted-foreground">预览</span>
                </div>

                <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-2">
                    <div className="grid grid-cols-4 gap-1">
                        <Tile
                            active={isSameSelection(draft, {
                                kind: "default",
                            })}
                            label="默认"
                            onClick={() => setDraft({ kind: "default" })}
                        >
                            <RingThumb {...previewFor({ kind: "default" })} />
                        </Tile>

                        {CIRCLE_PRESETS.map((preset) => (
                            <Tile
                                key={preset.key}
                                active={isSameSelection(draft, {
                                    kind: "preset",
                                    key: preset.key,
                                })}
                                label={preset.label}
                                onClick={() =>
                                    setDraft({
                                        kind: "preset",
                                        key: preset.key,
                                    })
                                }
                            >
                                <RingThumb
                                    {...previewFor({
                                        kind: "preset",
                                        key: preset.key,
                                    })}
                                />
                            </Tile>
                        ))}

                        <Tile
                            active={draft.kind === "none"}
                            label="不显示"
                            onClick={() => setDraft({ kind: "none" })}
                        >
                            <span className="grid h-12 w-12 place-items-center rounded-full border-2 border-dashed border-border text-muted-foreground">
                                <Ban className="size-5" aria-hidden="true" />
                            </span>
                        </Tile>
                    </div>

                    {rings.length > 0 && (
                        <>
                            <h3 className="mt-4 text-xs font-semibold text-muted-foreground">
                                我的头像框
                            </h3>
                            <div className="mt-1 grid grid-cols-4 gap-1">
                                {rings.map((ring) => (
                                    <div key={ring.id} className="relative">
                                        <Tile
                                            active={isSameSelection(draft, {
                                                kind: "custom",
                                                id: ring.id,
                                            })}
                                            label={ring.name}
                                            onClick={() =>
                                                setDraft({
                                                    kind: "custom",
                                                    id: ring.id,
                                                })
                                            }
                                        >
                                            <RingThumb
                                                circleUrl={getFileUrl(
                                                    ring,
                                                    ring.image,
                                                    "200x200",
                                                )}
                                                preset=""
                                            />
                                        </Tile>
                                        <button
                                            type="button"
                                            aria-label={`删除头像框 ${ring.name}`}
                                            className="absolute -right-1 -top-1 grid h-5 w-5 place-items-center rounded-full border border-border bg-background text-muted-foreground shadow-soft transition-colors hover:text-destructive"
                                            onClick={() => {
                                                void handleDelete(ring);
                                            }}
                                        >
                                            <X
                                                className="size-3"
                                                aria-hidden="true"
                                            />
                                        </button>
                                    </div>
                                ))}
                            </div>
                        </>
                    )}

                    <Button
                        className="mt-4 w-full border-dashed"
                        disabled={uploadRing.isPending}
                        onClick={() => {
                            void handleUpload();
                        }}
                        type="button"
                        variant="outline"
                    >
                        <Plus className="mr-2 size-4" aria-hidden="true" />
                        上传自定义头像框
                    </Button>
                </div>

                <DrawerFooter className="flex-row gap-2">
                    <DrawerClose asChild>
                        <Button
                            className="flex-1"
                            type="button"
                            variant="outline"
                        >
                            取消
                        </Button>
                    </DrawerClose>
                    <Button
                        className="flex-1"
                        disabled={setRing.isPending}
                        onClick={() => {
                            void handleApply();
                        }}
                        type="button"
                    >
                        {setRing.isPending ? "保存中..." : "保存"}
                    </Button>
                </DrawerFooter>
            </DrawerContent>
        </Drawer>
    );
}
