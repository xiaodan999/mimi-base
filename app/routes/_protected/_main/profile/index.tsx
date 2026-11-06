import { useState } from "react";
import { Link, createFileRoute } from "@tanstack/react-router";
import { Camera, ChevronRight, Info, Pencil, Sparkles } from "lucide-react";
import { toast } from "sonner";

import { isUpdateUnseen, readSeenUpdate } from "@/app/about/seen";
import { UPDATES } from "@/app/about/updates";
import { useAi } from "@/app/ai/AiContext";
import TouXiang from "@/components/TouXiang";
import { CIRCLE_PRESETS, NO_RING } from "@/components/TouXiang/presets";
import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { type User, useCurrentUser } from "@/lib/auth";
import { getUserAvatarUrl, getUserRing } from "@/lib/pb";
import showFilePicker from "@/lib/showFilePicker";
import { toastPromise } from "@/lib/toast-promise";

import AvatarCropper from "./-components/avatar-cropper";
import RingPicker from "./-components/ring-picker";
import { useSetAvatar, useUpdateNickname } from "./-data";

export const Route = createFileRoute("/_protected/_main/profile/")({
    component: Page,
});

function ringLabel(user: User): string {
    if (user.circle) return "自定义头像框";
    if (user.circle_preset === NO_RING) return "不显示头像框";
    const preset = CIRCLE_PRESETS.find(
        (item) => item.key === user.circle_preset,
    );
    return preset ? preset.label : "默认头像框";
}

async function pickImage(): Promise<File | null> {
    try {
        return await showFilePicker("image/*").catch((error) => {
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
        return null;
    }
}

function Page() {
    const user = useCurrentUser();
    const ring = getUserRing(user);
    const { openSettings } = useAi();
    // Read on mount: opening 关于 marks the update seen, and this page
    // remounts when the user comes back.
    const updateUnseen = isUpdateUnseen(UPDATES[0]?.date, readSeenUpdate());

    const [cropOpen, setCropOpen] = useState(false);
    const [cropFile, setCropFile] = useState<File | null>(null);
    const [ringOpen, setRingOpen] = useState(false);
    const [nicknameOpen, setNicknameOpen] = useState(false);
    const [nickname, setNickname] = useState(user.user_name);

    const setAvatar = useSetAvatar();
    const setNicknameMutation = useUpdateNickname();

    const chooseAvatar = async () => {
        const file = await pickImage();
        if (!file) return;
        setCropFile(file);
        setCropOpen(true);
    };

    const handleCropConfirm = async (blob: Blob) => {
        const type = blob.type || "image/webp";
        const ext = type.split("/")[1] || "webp";
        const file = new File([blob], `${Date.now()}.${ext}`, { type });

        try {
            await toastPromise(setAvatar.mutateAsync(file), {
                loading: "更新头像中...",
                success: "头像已更新",
                error: "头像更新失败",
            });
            setCropOpen(false);
            setCropFile(null);
        } catch {
            // Keep the cropper open so the user can retry.
        }
    };

    const saveNickname = async () => {
        const value = nickname.trim();
        if (!value) return;

        try {
            await toastPromise(setNicknameMutation.mutateAsync(value), {
                loading: "保存昵称中...",
                success: "昵称已更新",
                error: "昵称保存失败",
            });
            setNicknameOpen(false);
        } catch {
            // toastPromise already reported the failure.
        }
    };

    return (
        <div className="mx-auto w-full max-w-md px-4 pb-8 pt-[calc(1rem+env(safe-area-inset-top))]">
            {/* 个人资料 is a bottom-nav tab root: no back arrow, same as the
                other tab roots. The nav bar is the way back. */}
            <header>
                <h1 className="text-xl font-semibold tracking-tight">
                    个人资料
                </h1>
            </header>

            <section className="mt-4 rounded-3xl border border-border/60 bg-card p-6 shadow-soft">
                <div className="flex flex-col items-center">
                    <button
                        type="button"
                        aria-label="更换头像"
                        className="rounded-full transition-transform active:scale-95"
                        onClick={() => {
                            void chooseAvatar();
                        }}
                    >
                        <TouXiang
                            size={112}
                            touXiangUrl={getUserAvatarUrl(user)}
                            name={user.user_name}
                            {...ring}
                        />
                    </button>
                    <p className="mt-3 text-xs text-muted-foreground">
                        点击头像更换
                    </p>

                    <div className="mt-2 flex items-center gap-1">
                        <h2 className="max-w-[12rem] truncate text-xl font-semibold">
                            {user.user_name || "朋友"}
                        </h2>
                        <Button
                            aria-label="修改昵称"
                            className="size-8 text-muted-foreground"
                            size="icon"
                            variant="ghost"
                            onClick={() => {
                                setNickname(user.user_name);
                                setNicknameOpen(true);
                            }}
                        >
                            <Pencil className="size-4" aria-hidden="true" />
                        </Button>
                    </div>
                    <p className="text-xs text-muted-foreground">
                        当前：{ringLabel(user)}
                    </p>
                </div>

                <div className="mt-6 grid grid-cols-2 gap-2">
                    <Button
                        variant="outline"
                        onClick={() => {
                            void chooseAvatar();
                        }}
                    >
                        <Camera className="mr-2 size-4" aria-hidden="true" />
                        更换头像
                    </Button>
                    <Button variant="outline" onClick={() => setRingOpen(true)}>
                        <Sparkles className="mr-2 size-4" aria-hidden="true" />
                        更换头像框
                    </Button>
                </div>
            </section>

            <section className="mt-4 rounded-3xl border border-border/60 bg-card p-5">
                <h3 className="text-sm font-semibold">AI 设置</h3>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">
                    AI 由本站统一提供，登录即可用于记账、配文、学习和年度
                    报告，不需要填 Key。这里可以调整完成通知和本机预算。
                </p>
                <Button
                    className="mt-3 w-full"
                    variant="outline"
                    onClick={openSettings}
                >
                    <Sparkles className="mr-2 size-4" aria-hidden="true" />
                    打开 AI 设置
                </Button>
            </section>

            <section className="mt-4 rounded-3xl border border-border/60 bg-card p-5">
                <h3 className="text-sm font-semibold">关于头像框</h3>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">
                    内置头像框是矢量绘制，任何尺寸都很清晰；星轨和霓虹会轻轻动起来（系统开启“减少动态效果”时会自动静止）。也可以上传自己的头像框。
                </p>
            </section>

            <Link
                to="/about"
                className="mt-4 flex items-center gap-3 rounded-3xl border border-border/60 bg-card p-4 shadow-soft transition-transform active:scale-[0.99]"
            >
                <span className="grid size-10 shrink-0 place-items-center rounded-full bg-primary/10 text-primary">
                    <Info className="size-5" aria-hidden="true" />
                </span>
                <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2 text-sm font-semibold">
                        关于秘密基地
                        {updateUnseen && (
                            <span
                                aria-label="有新的更新记录"
                                className="size-2 shrink-0 rounded-full bg-primary"
                            />
                        )}
                    </span>
                    <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                        更新记录与构建信息
                    </span>
                </span>
                <ChevronRight
                    className="size-4 shrink-0 text-muted-foreground"
                    aria-hidden="true"
                />
            </Link>

            <RingPicker
                open={ringOpen}
                onOpenChange={setRingOpen}
                user={user}
            />

            <AvatarCropper
                busy={setAvatar.isPending}
                file={cropFile}
                open={cropOpen}
                ring={ring}
                onOpenChange={(next) => {
                    setCropOpen(next);
                    if (!next) setCropFile(null);
                }}
                onConfirm={handleCropConfirm}
            />

            <Dialog open={nicknameOpen} onOpenChange={setNicknameOpen}>
                <DialogContent className="max-w-sm rounded-2xl">
                    <DialogHeader>
                        <DialogTitle>修改昵称</DialogTitle>
                        <DialogDescription>
                            这个昵称会显示在动态和评论里。
                        </DialogDescription>
                    </DialogHeader>
                    <Input
                        aria-label="昵称"
                        autoFocus
                        maxLength={24}
                        onChange={(event) => setNickname(event.target.value)}
                        placeholder="给自己起个名字"
                        value={nickname}
                    />
                    <DialogFooter className="gap-2 sm:gap-0">
                        <Button
                            type="button"
                            variant="outline"
                            onClick={() => setNicknameOpen(false)}
                        >
                            取消
                        </Button>
                        <Button
                            disabled={
                                !nickname.trim() ||
                                setNicknameMutation.isPending ||
                                nickname.trim() === user.user_name
                            }
                            type="button"
                            onClick={() => {
                                void saveNickname();
                            }}
                        >
                            {setNicknameMutation.isPending
                                ? "保存中..."
                                : "保存"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
