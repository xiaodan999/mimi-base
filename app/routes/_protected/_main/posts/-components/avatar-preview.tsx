import { useState } from "react";

import TouXiang from "@/components/TouXiang";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogTitle,
} from "@/components/ui/dialog";
import type { User } from "@/lib/auth";
import { getUserAvatarUrl, getUserRing } from "@/lib/pb";
import { cn } from "@/lib/utils";

type AvatarPreviewProps = {
    user: User;
    /** Thumbnail size; the preview always renders a large square. */
    size: number;
    className?: string;
};

/**
 * A tappable avatar that opens the full-size version, ring included. Files
 * are protected, so the URL is rebuilt on every render to pick up a fresh
 * token instead of freezing one into the page.
 */
export default function AvatarPreview({
    user,
    size,
    className,
}: AvatarPreviewProps) {
    const [open, setOpen] = useState(false);
    const name = user.user_name || "朋友";
    const avatarUrl = getUserAvatarUrl(user);
    const ring = getUserRing(user);

    return (
        <>
            <button
                type="button"
                aria-label={`查看${name}的头像`}
                className={cn(
                    "shrink-0 rounded-full transition-transform active:scale-95",
                    className,
                )}
                // The button needs its own size: as a stretched flex item it
                // grows to the row height, and buttons center their content
                // vertically, so the avatar drifted to the middle of a tall
                // post/comment instead of sitting next to the name.
                style={{ width: size, height: size }}
                onClick={() => setOpen(true)}
            >
                <TouXiang
                    size={size}
                    touXiangUrl={avatarUrl}
                    name={name}
                    {...ring}
                />
            </button>

            <Dialog open={open} onOpenChange={setOpen}>
                <DialogContent
                    className="w-auto max-w-none border-none bg-transparent p-0 shadow-none"
                    overlayClassName="bg-black/85 backdrop-blur-sm"
                    showCloseButton={false}
                >
                    <DialogTitle className="sr-only">{name}的头像</DialogTitle>
                    <DialogDescription className="sr-only">
                        点击空白处关闭
                    </DialogDescription>
                    <div className="flex flex-col items-center gap-3">
                        <TouXiang
                            size="min(72vw, 20rem)"
                            touXiangUrl={avatarUrl}
                            name={name}
                            {...ring}
                        />
                        <p className="text-sm font-medium text-white/90">
                            {name}
                        </p>
                    </div>
                </DialogContent>
            </Dialog>
        </>
    );
}
