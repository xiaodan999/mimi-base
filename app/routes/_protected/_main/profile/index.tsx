import { useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
    BarChart3,
    Bell,
    Camera,
    Check,
    ChevronRight,
    Info,
    Lightbulb,
    LogOut,
    type LucideIcon,
    MessageSquareWarning,
    Pencil,
    Sparkles,
    UserRound,
} from "lucide-react";
import { type ReactNode, useState } from "react";
import { toast } from "sonner";

import { isUpdateUnseen, readSeenUpdate } from "@/app/about/seen";
import { UPDATES } from "@/app/about/updates";
import { useAi } from "@/app/ai/AiContext";
import { abortAllChatRuns } from "@/app/chat/run-store";
import { useUnreadNotificationCount } from "@/app/notifications/data";
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
import {
    ensureDevSession,
    useAuth,
    useCurrentUser,
    type User,
} from "@/lib/auth";
import { DEV_ACCOUNTS, type DevAccount } from "@/lib/dev-accounts";
import { getUserAvatarUrl, getUserRing } from "@/lib/pb";
import showFilePicker from "@/lib/showFilePicker";
import { toastPromise } from "@/lib/toast-promise";
import { cn } from "@/lib/utils";

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

/** Icon + title + description + chevron, shared by every grouped row. */
function RowContent({
    icon: Icon,
    title,
    description,
    badge,
    tone = "default",
}: {
    icon: LucideIcon;
    title: string;
    description: string;
    badge?: ReactNode;
    tone?: "default" | "destructive";
}) {
    return (
        <>
            <span
                className={cn(
                    "grid size-10 shrink-0 place-items-center rounded-full",
                    tone === "destructive"
                        ? "bg-destructive/10 text-destructive"
                        : "bg-primary/10 text-primary",
                )}
            >
                <Icon className="size-5" aria-hidden="true" />
            </span>
            <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2 text-sm font-semibold">
                    {title}
                    {badge}
                </span>
                <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                    {description}
                </span>
            </span>
            <ChevronRight
                className="size-4 shrink-0 text-muted-foreground"
                aria-hidden="true"
            />
        </>
    );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
    return (
        <section className="mt-6">
            <h2 className="px-1 text-xs font-semibold tracking-wide text-muted-foreground">
                {title}
            </h2>
            <div className="mt-2 divide-y divide-border/60 overflow-hidden rounded-3xl border border-border/60 bg-card shadow-soft">
                {children}
            </div>
        </section>
    );
}

function Page() {
    const user = useCurrentUser();
    const auth = useAuth();
    const queryClient = useQueryClient();
    const ring = getUserRing(user);
    const { openSettings } = useAi();
    const { data: unreadNotifications = 0 } = useUnreadNotificationCount();
    // Read on mount: opening 关于 marks the update seen, and this page
    // remounts when the user comes back.
    const updateUnseen = isUpdateUnseen(UPDATES[0]?.date, readSeenUpdate());

    const [cropOpen, setCropOpen] = useState(false);
    const [cropFile, setCropFile] = useState<File | null>(null);
    const [ringOpen, setRingOpen] = useState(false);
    const [nicknameOpen, setNicknameOpen] = useState(false);
    const [nickname, setNickname] = useState(user.user_name);
    const [switching, setSwitching] = useState<string | null>(null);

    const setAvatar = useSetAvatar();
    const setNicknameMutation = useUpdateNickname();
    const currentEmail = user.email ?? "";

    const switchAccount = async (account: DevAccount) => {
        if (account.email === currentEmail) return;
        setSwitching(account.key);
        try {
            // An in-flight chat run belongs to the account we are leaving.
            abortAllChatRuns();
            const result = await ensureDevSession(auth, account.key);
            if (!result.ok) {
                toast.error(result.error ?? "切换账号失败");
                return;
            }
            // Drop the previous account's cached rows before the page
            // re-renders with the new identity.
            queryClient.clear();
            toast.success(`已切换到${account.name}`);
        } catch (error) {
            toast.error(
                error instanceof Error ? error.message : "切换账号失败",
            );
        } finally {
            setSwitching(null);
        }
    };

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
        <div className="mx-auto w-full max-w-md px-4 pt-[calc(1rem+env(safe-area-inset-top))] pb-8">
            {/* 个人资料 is a bottom-nav tab root: no back arrow, same as the
                other tab roots. The nav bar is the way back. */}
            <header>
                <h1 className="text-xl font-semibold tracking-tight">
                    个人资料
                </h1>
            </header>

            {/* Identity first: avatar, nickname and ring are the page's
                subject; settings and links are grouped below. */}
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

                {/* Ring context stays next to the control it explains, as a
                    compact note instead of its own full card. */}
                <p className="mt-4 rounded-2xl bg-muted/40 px-3 py-2.5 text-xs leading-5 text-muted-foreground">
                    内置头像框是矢量绘制，任何尺寸都很清晰；星轨和霓虹会轻轻动起来（系统开启「减少动态效果」时会自动静止）。也可以上传自己的头像框。
                </p>
            </section>

            <Section title="功能">
                <Link
                    to="/notifications"
                    className="flex items-center gap-3 px-4 py-3.5 transition-colors active:bg-accent"
                >
                    <RowContent
                        description={
                            unreadNotifications > 0
                                ? `${unreadNotifications} 条未读，点开看看`
                                : "点赞、评论和回复都会收在这里"
                        }
                        icon={Bell}
                        title="互动消息"
                        badge={
                            unreadNotifications > 0 ? (
                                <span className="rounded-full bg-primary px-1.5 py-0.5 text-[10px] leading-none font-bold text-primary-foreground">
                                    {unreadNotifications > 9
                                        ? "9+"
                                        : unreadNotifications}
                                </span>
                            ) : undefined
                        }
                    />
                </Link>
                <Link
                    to="/report"
                    className="flex items-center gap-3 px-4 py-3.5 transition-colors active:bg-accent"
                >
                    <RowContent
                        description="这一年被你过成了什么样"
                        icon={BarChart3}
                        title="年度报告"
                    />
                </Link>
                <button
                    type="button"
                    className="flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors active:bg-accent"
                    onClick={openSettings}
                >
                    <RowContent
                        description="统一提供，无需填写 Key，可调通知和预算"
                        icon={Sparkles}
                        title="AI 设置"
                    />
                </button>
                <Link
                    to="/feedback"
                    className="flex items-center gap-3 px-4 py-3.5 transition-colors active:bg-accent"
                >
                    <RowContent
                        description="遇到问题？带上截图、文件和 AI 对话告诉我们"
                        icon={MessageSquareWarning}
                        title="问题反馈"
                    />
                </Link>
                <Link
                    search={{ tab: "feature" }}
                    to="/feedback"
                    className="flex items-center gap-3 px-4 py-3.5 transition-colors active:bg-accent"
                >
                    <RowContent
                        description="想要什么新功能？说说你的想法"
                        icon={Lightbulb}
                        title="功能建议"
                    />
                </Link>
            </Section>

            <Section title="账号">
                <Link
                    to="/logout"
                    className="flex items-center gap-3 px-4 py-3.5 transition-colors active:bg-accent"
                >
                    <RowContent
                        description="退出当前账号，回到登录页换人"
                        icon={LogOut}
                        title="退出登录"
                        tone="destructive"
                    />
                </Link>
            </Section>

            {import.meta.env.DEV && DEV_ACCOUNTS.length > 0 ? (
                <Section title="开发账号">
                    {DEV_ACCOUNTS.map((account) => {
                        const current = account.email === currentEmail;
                        const pending = switching === account.key;
                        return (
                            <button
                                key={account.key}
                                type="button"
                                aria-current={current ? "true" : undefined}
                                className="flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors active:bg-accent disabled:cursor-default"
                                disabled={current || switching !== null}
                                onClick={() => void switchAccount(account)}
                            >
                                <span className="grid size-10 shrink-0 place-items-center rounded-full bg-primary/10 text-primary">
                                    {current ? (
                                        <Check
                                            className="size-5"
                                            aria-hidden="true"
                                        />
                                    ) : (
                                        <UserRound
                                            className="size-5"
                                            aria-hidden="true"
                                        />
                                    )}
                                </span>
                                <span className="min-w-0 flex-1">
                                    <span className="flex items-center gap-2 text-sm font-semibold">
                                        {account.name}
                                        {current ? (
                                            <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
                                                当前
                                            </span>
                                        ) : null}
                                    </span>
                                    <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                                        {account.email}
                                    </span>
                                </span>
                                <span className="text-xs text-muted-foreground">
                                    {pending
                                        ? "切换中…"
                                        : current
                                          ? ""
                                          : "切换"}
                                </span>
                            </button>
                        );
                    })}
                </Section>
            ) : null}

            <Section title="关于">
                <Link
                    to="/about"
                    className="flex items-center gap-3 px-4 py-3.5 transition-colors active:bg-accent"
                >
                    <RowContent
                        badge={
                            updateUnseen ? (
                                <span
                                    aria-label="有新的更新记录"
                                    className="size-2 shrink-0 rounded-full bg-primary"
                                />
                            ) : undefined
                        }
                        description="更新记录与构建信息"
                        icon={Info}
                        title="关于秘密基地"
                    />
                </Link>
            </Section>

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
