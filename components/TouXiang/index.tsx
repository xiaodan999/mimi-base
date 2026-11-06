import type { CSSProperties } from "react";
import { SmileFill } from "antd-mobile-icons";

import { cn } from "@/lib/utils";

import { CirclePresetRing, NO_RING, isCirclePreset } from "./presets";

const DEFAULT_CIRCLE = "/images/blue-circle.png";

type TouXiangProps = {
    className?: string;
    /** Pixels, or any CSS length (e.g. `min(72vw, 20rem)` for a preview). */
    size: number | string;
    touXiangUrl: string;
    circleUrl?: string;
    /** Built-in ring key; "" is the default ring, "none" hides it. */
    preset?: string;
    style?: CSSProperties;
    /** 头像对应用户名；提供时生成「<name>的头像」，否则按装饰图处理（姓名在旁边）。 */
    name?: string;
};

type CircleRingProps = {
    circleUrl?: string;
    preset?: string;
    className?: string;
};

/**
 * The ring layer on its own. Exported so the avatar cropper can show the
 * final result around the square viewport before the crop is uploaded.
 */
export function CircleRing({ circleUrl, preset, className }: CircleRingProps) {
    if (preset === NO_RING) return null;

    if (circleUrl) {
        return (
            <img
                alt=""
                aria-hidden="true"
                className={cn(
                    "pointer-events-none select-none object-contain",
                    className,
                )}
                draggable={false}
                src={circleUrl}
            />
        );
    }

    if (preset && isCirclePreset(preset)) {
        return (
            <CirclePresetRing
                className={cn("pointer-events-none", className)}
                preset={preset}
            />
        );
    }

    return (
        <img
            alt=""
            aria-hidden="true"
            className={cn(
                "pointer-events-none select-none object-contain",
                className,
            )}
            draggable={false}
            src={DEFAULT_CIRCLE}
        />
    );
}

export default function TouXiang({
    className,
    size,
    touXiangUrl,
    circleUrl = "",
    preset = "",
    style = {},
    name,
}: TouXiangProps) {
    return (
        <div
            className={cn("relative shrink-0", className)}
            style={{
                width: typeof size === "number" ? `${size}px` : size,
                height: typeof size === "number" ? `${size}px` : size,
                ...style,
            }}
        >
            <div className="absolute inset-0 overflow-hidden rounded-full bg-muted">
                {touXiangUrl ? (
                    <img
                        alt={name ? `${name}的头像` : ""}
                        className="h-full w-full object-cover"
                        draggable={false}
                        onContextMenu={(event) => event.preventDefault()}
                        src={touXiangUrl}
                    />
                ) : (
                    <SmileFill className="h-full w-full text-muted-foreground" />
                )}
            </div>
            <CircleRing
                circleUrl={circleUrl}
                preset={preset}
                className="absolute inset-0 h-full w-full"
            />
        </div>
    );
}
