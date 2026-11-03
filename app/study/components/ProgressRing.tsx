import { cn } from "@/lib/utils";

/**
 * Small SVG progress ring used by the study hub and the home entry. The track
 * and stroke accept CSS colors so callers can tint them per subject without
 * Tailwind classes for every accent.
 */
export default function ProgressRing({
    value,
    size = 44,
    stroke = 4,
    color = "currentColor",
    trackColor,
    label,
    className,
}: {
    value: number;
    size?: number;
    stroke?: number;
    color?: string;
    trackColor?: string;
    label?: string | number;
    className?: string;
}) {
    const clamped = Math.max(0, Math.min(100, value));
    const radius = (size - stroke) / 2;
    const circumference = 2 * Math.PI * radius;
    const offset = circumference - (clamped / 100) * circumference;
    const center = size / 2;

    return (
        <span
            role="img"
            aria-label={`进度 ${Math.round(clamped)}%`}
            className={cn(
                "relative inline-grid shrink-0 place-items-center",
                className,
            )}
            style={{ width: size, height: size }}
        >
            <svg
                width={size}
                height={size}
                viewBox={`0 0 ${size} ${size}`}
                aria-hidden="true"
                className="-rotate-90"
            >
                <circle
                    cx={center}
                    cy={center}
                    r={radius}
                    fill="none"
                    strokeWidth={stroke}
                    className={trackColor ? undefined : "stroke-border/70"}
                    style={trackColor ? { stroke: trackColor } : undefined}
                />
                <circle
                    cx={center}
                    cy={center}
                    r={radius}
                    fill="none"
                    strokeWidth={stroke}
                    strokeLinecap="round"
                    stroke={color}
                    strokeDasharray={circumference}
                    strokeDashoffset={offset}
                    className="transition-[stroke-dashoffset] duration-700 ease-out"
                />
            </svg>
            {label !== undefined && (
                <span
                    aria-hidden="true"
                    className="absolute text-[10px] font-bold tabular-nums"
                    style={{ color }}
                >
                    {label}
                </span>
            )}
        </span>
    );
}
