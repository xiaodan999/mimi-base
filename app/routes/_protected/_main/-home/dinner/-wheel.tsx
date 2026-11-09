import { Loader2, Sparkles } from "lucide-react";

import { cn } from "@/lib/utils";

import type { DinnerOption } from "./options";
import {
    segmentAngle,
    segmentCenterAngle,
    segmentPaletteIndex,
    shouldDrawWheelLabel,
    wheelLabel,
    wheelLabelFontSize,
} from "./options";

const CX = 160;
const CY = 160;
const R = 148;
const LABEL_RADIUS = 100;

function point(angleDegrees: number, radius: number) {
    const radians = (angleDegrees * Math.PI) / 180;
    return {
        x: CX + radius * Math.sin(radians),
        y: CY - radius * Math.cos(radians),
    };
}

function slicePath(index: number, count: number): string {
    const start = index * segmentAngle(count);
    const end = start + segmentAngle(count);
    const from = point(start, R);
    const to = point(end, R);
    const largeArc = end - start > 180 ? 1 : 0;
    return [
        `M ${CX} ${CY}`,
        `L ${from.x} ${from.y}`,
        `A ${R} ${R} 0 ${largeArc} 1 ${to.x} ${to.y}`,
        "Z",
    ].join(" ");
}

type DinnerWheelProps = {
    options: DinnerOption[];
    rotation: number;
    spinning: boolean;
    reducedMotion: boolean;
    /** Winning slice to outline; -1 while idle/spinning. */
    selectedIndex?: number;
    onSpin: () => void;
    onSpinEnd: () => void;
};

/**
 * Decorative SVG wheel. The rotor (slices + labels) is the only element that
 * rotates; the pointer and the center button stay still. Colors come from the
 * `--chart-*` theme tokens, so the wheel follows light/dark mode.
 *
 * Crowded wheels only label every Nth slice: printing all 30 names would
 * merge into an unreadable ring. The result card always carries the full
 * winning name, and the winner is outlined on the wheel itself.
 */
export function DinnerWheel({
    options,
    rotation,
    spinning,
    reducedMotion,
    selectedIndex = -1,
    onSpin,
    onSpinEnd,
}: DinnerWheelProps) {
    const count = options.length;
    const fontSize = wheelLabelFontSize(count);
    const labelMax = count > 18 ? 5 : 6;
    const showRimDots = count > 1;
    const highlightIndex =
        selectedIndex >= 0 && selectedIndex < count ? selectedIndex : -1;

    return (
        <div className="relative mx-auto w-full max-w-[320px] select-none">
            <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-2 rounded-full bg-[radial-gradient(circle_at_50%_30%,hsl(var(--chart-3)/0.22),transparent_65%)] blur-xl"
            />

            <div className="relative aspect-square">
                <div
                    className={cn(
                        "absolute inset-0 will-change-transform",
                        !reducedMotion && "dinner-wheel-rotor",
                    )}
                    style={{ transform: `rotate(${rotation}deg)` }}
                    onTransitionEnd={(event) => {
                        if (event.propertyName === "transform") onSpinEnd();
                    }}
                >
                    <svg
                        viewBox="0 0 320 320"
                        className="size-full drop-shadow-[0_18px_30px_hsl(var(--chart-1)/0.18)]"
                        aria-hidden="true"
                    >
                        <circle
                            cx={CX}
                            cy={CY}
                            r={R + 5}
                            fill="hsl(var(--card))"
                            stroke="hsl(var(--border))"
                            strokeWidth="2"
                        />
                        {count === 1 ? (
                            <circle
                                cx={CX}
                                cy={CY}
                                r={R}
                                fill="hsl(var(--chart-1))"
                            />
                        ) : (
                            count > 0 &&
                            options.map((option, index) => (
                                <path
                                    key={option.id}
                                    d={slicePath(index, count)}
                                    fill={`hsl(var(--chart-${segmentPaletteIndex(index, count) + 1})`}
                                    stroke="hsl(var(--background))"
                                    strokeWidth="2"
                                />
                            ))
                        )}
                        {count === 0 && (
                            <circle
                                cx={CX}
                                cy={CY}
                                r={R}
                                fill="hsl(var(--muted))"
                                stroke="hsl(var(--border))"
                                strokeWidth="2"
                                strokeDasharray="8 9"
                            />
                        )}

                        {showRimDots &&
                            options.map((option, index) => {
                                const dot = point(
                                    segmentCenterAngle(index, count),
                                    R - 13,
                                );
                                return (
                                    <circle
                                        key={`dot-${option.id}`}
                                        cx={dot.x}
                                        cy={dot.y}
                                        r="2"
                                        fill="hsl(var(--background))"
                                        opacity="0.45"
                                    />
                                );
                            })}

                        {highlightIndex >= 0 &&
                            (count === 1 ? (
                                <circle
                                    data-testid="dinner-selected-slice"
                                    cx={CX}
                                    cy={CY}
                                    r={R - 1}
                                    fill="none"
                                    stroke="hsl(var(--foreground))"
                                    strokeWidth="3"
                                    opacity="0.9"
                                />
                            ) : (
                                <path
                                    data-testid="dinner-selected-slice"
                                    d={slicePath(highlightIndex, count)}
                                    fill="none"
                                    stroke="hsl(var(--foreground))"
                                    strokeWidth="3"
                                    strokeLinejoin="round"
                                    opacity="0.9"
                                />
                            ))}

                        {count > 1 &&
                            options.map((option, index) => {
                                if (!shouldDrawWheelLabel(index, count)) {
                                    return null;
                                }
                                const angle = segmentCenterAngle(index, count);
                                const flip = angle > 90 && angle < 270;
                                return (
                                    <g
                                        key={`label-${option.id}`}
                                        transform={`rotate(${angle} ${CX} ${CY})`}
                                    >
                                        <g
                                            transform={`translate(${CX} ${CY - LABEL_RADIUS})`}
                                        >
                                            <text
                                                transform={
                                                    flip
                                                        ? "rotate(180)"
                                                        : undefined
                                                }
                                                textAnchor="middle"
                                                dominantBaseline="middle"
                                                fontSize={fontSize}
                                                fontWeight="600"
                                                fill="hsl(var(--background))"
                                                style={{
                                                    fontFamily:
                                                        "ui-rounded, system-ui, sans-serif",
                                                }}
                                            >
                                                {wheelLabel(
                                                    option.name,
                                                    labelMax,
                                                )}
                                            </text>
                                        </g>
                                    </g>
                                );
                            })}

                        {count === 1 && (
                            <text
                                x={CX}
                                y={CY - LABEL_RADIUS}
                                textAnchor="middle"
                                dominantBaseline="middle"
                                fontSize={12}
                                fontWeight="600"
                                fill="hsl(var(--background))"
                            >
                                {wheelLabel(options[0].name, 8)}
                            </text>
                        )}

                        <circle
                            cx={CX}
                            cy={CY}
                            r="62"
                            fill="hsl(var(--background))"
                            stroke="hsl(var(--border))"
                            strokeWidth="2"
                        />
                        <circle
                            cx={CX}
                            cy={CY}
                            r="55"
                            fill="none"
                            stroke="hsl(var(--primary)/0.12)"
                            strokeWidth="1"
                        />
                    </svg>
                </div>

                {/* Pointer: static, points into the top slice. */}
                <div
                    aria-hidden="true"
                    className="pointer-events-none absolute left-1/2 top-0 z-20 -translate-x-1/2 -translate-y-[42%]"
                >
                    <svg width="30" height="38" viewBox="0 0 30 38">
                        <path
                            d="M15 36 L2.5 8 Q15 -5 27.5 8 Z"
                            fill="hsl(var(--primary))"
                            stroke="hsl(var(--background))"
                            strokeWidth="3"
                            strokeLinejoin="round"
                        />
                    </svg>
                </div>

                <button
                    type="button"
                    onClick={onSpin}
                    disabled={spinning || count === 0}
                    aria-label={
                        spinning ? "正在抽取今晚的晚餐" : "开始抽取今晚的晚餐"
                    }
                    aria-busy={spinning}
                    className="absolute left-1/2 top-1/2 z-10 grid size-[23%] min-h-16 min-w-16 -translate-x-1/2 -translate-y-1/2 touch-manipulation place-items-center rounded-full border-4 border-background bg-primary text-primary-foreground shadow-[0_10px_24px_-8px_hsl(var(--primary)/0.75)] transition-transform active:scale-95 disabled:opacity-70"
                >
                    {spinning ? (
                        <Loader2
                            className="size-6 animate-spin"
                            aria-hidden="true"
                        />
                    ) : (
                        <span className="flex flex-col items-center gap-0.5">
                            <Sparkles
                                className="size-4 opacity-90"
                                aria-hidden="true"
                            />
                            <span className="text-sm font-bold leading-none tracking-wide">
                                开转
                            </span>
                        </span>
                    )}
                </button>
            </div>
        </div>
    );
}
