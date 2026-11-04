import { useId } from "react";

export const DEFAULT_RING = "";
export const NO_RING = "none";

export type CirclePreset = {
    key: string;
    label: string;
    animated?: boolean;
};

/**
 * Built-in rings are drawn as SVG instead of uploaded images: they stay
 * sharp at every avatar size and one of them can animate without shipping an
 * animated file.
 */
export const CIRCLE_PRESETS: CirclePreset[] = [
    { key: "classic", label: "经典" },
    { key: "thin", label: "极简" },
    { key: "gradient", label: "渐变" },
    { key: "orbit", label: "星轨", animated: true },
    { key: "neon", label: "霓虹", animated: true },
    { key: "gold", label: "鎏金" },
];

export function isCirclePreset(key: string | undefined): boolean {
    return CIRCLE_PRESETS.some((preset) => preset.key === key);
}

const RING = { cx: 50, cy: 50, fill: "none" } as const;

export function CirclePresetRing({
    preset,
    className,
}: {
    preset: string;
    className?: string;
}) {
    // Gradient / filter ids must be unique per instance, otherwise several
    // avatars on the feed would all reference the first one's definition.
    const uid = useId().replace(/:/g, "");

    switch (preset) {
        case "classic":
            return (
                <svg
                    className={className}
                    viewBox="0 0 100 100"
                    aria-hidden="true"
                >
                    <circle {...RING} r="45" stroke="#3b82f6" strokeWidth="6" />
                    <circle
                        {...RING}
                        r="41"
                        stroke="#93c5fd"
                        strokeWidth="1.4"
                        opacity="0.85"
                    />
                </svg>
            );
        case "thin":
            return (
                <svg
                    className={className}
                    viewBox="0 0 100 100"
                    aria-hidden="true"
                >
                    <circle
                        {...RING}
                        r="46"
                        className="text-foreground"
                        stroke="currentColor"
                        strokeWidth="2"
                        opacity="0.35"
                    />
                </svg>
            );
        case "gradient":
            return (
                <svg
                    className={className}
                    viewBox="0 0 100 100"
                    aria-hidden="true"
                >
                    <defs>
                        <linearGradient
                            id={`${uid}-gradient`}
                            x1="0"
                            y1="0"
                            x2="1"
                            y2="1"
                        >
                            <stop offset="0%" stopColor="#f472b6" />
                            <stop offset="50%" stopColor="#a855f7" />
                            <stop offset="100%" stopColor="#f59e0b" />
                        </linearGradient>
                    </defs>
                    <circle
                        {...RING}
                        r="45"
                        stroke={`url(#${uid}-gradient)`}
                        strokeWidth="6"
                        strokeLinecap="round"
                    />
                </svg>
            );
        case "orbit":
            return (
                <svg
                    className={className}
                    viewBox="0 0 100 100"
                    aria-hidden="true"
                >
                    <g className="avatar-ring-spin">
                        <circle
                            {...RING}
                            r="45"
                            stroke="#818cf8"
                            strokeWidth="3"
                            strokeDasharray="10 9"
                            strokeLinecap="round"
                        />
                        <circle cx="50" cy="5" r="3" fill="#c7d2fe" />
                        <circle cx="50" cy="95" r="2" fill="#a5b4fc" />
                    </g>
                </svg>
            );
        case "neon":
            return (
                <svg
                    className={className}
                    viewBox="0 0 100 100"
                    aria-hidden="true"
                >
                    <defs>
                        <filter
                            id={`${uid}-glow`}
                            x="-50%"
                            y="-50%"
                            width="200%"
                            height="200%"
                        >
                            <feGaussianBlur stdDeviation="2.4" result="blur" />
                            <feMerge>
                                <feMergeNode in="blur" />
                                <feMergeNode in="SourceGraphic" />
                            </feMerge>
                        </filter>
                    </defs>
                    <circle
                        {...RING}
                        className="avatar-ring-pulse"
                        r="44.5"
                        stroke="#22d3ee"
                        strokeWidth="3.5"
                        filter={`url(#${uid}-glow)`}
                    />
                </svg>
            );
        case "gold":
            return (
                <svg
                    className={className}
                    viewBox="0 0 100 100"
                    aria-hidden="true"
                >
                    <defs>
                        <linearGradient
                            id={`${uid}-gold`}
                            x1="0"
                            y1="0"
                            x2="1"
                            y2="1"
                        >
                            <stop offset="0%" stopColor="#fef3c7" />
                            <stop offset="45%" stopColor="#fbbf24" />
                            <stop offset="60%" stopColor="#d97706" />
                            <stop offset="100%" stopColor="#fde68a" />
                        </linearGradient>
                    </defs>
                    <circle
                        {...RING}
                        r="45"
                        stroke={`url(#${uid}-gold)`}
                        strokeWidth="5"
                    />
                    <circle
                        {...RING}
                        r="40.5"
                        stroke="#fde68a"
                        strokeWidth="1"
                        opacity="0.8"
                    />
                </svg>
            );
        default:
            return null;
    }
}
