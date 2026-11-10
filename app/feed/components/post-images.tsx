import { type SyntheticEvent, useRef, useState } from "react";

import { cn } from "@/lib/utils";

export type PostImageView = {
    name: string;
    /** The full-size original, which is already a compressed WebP upload. */
    url: string;
    /** 600px grid thumbnail, or the original when the post has no thumb. */
    thumbUrl: string;
};

type ImageListProps = {
    images: PostImageView[];
    onOpen: (index: number) => void;
};

/**
 * 朋友圈-style square grid. 1 image keeps a single large square, 4 uses a
 * 2x2 grid, everything else uses 3 columns (9 max, the rest is counted).
 */
export function MomentsImageGrid({ images, onOpen }: ImageListProps) {
    if (images.length === 0) return null;

    const visible = images.slice(0, 9);
    const columns =
        visible.length === 1
            ? 1
            : visible.length === 2 || visible.length === 4
              ? 2
              : 3;
    const width =
        columns === 1
            ? "max-w-[220px]"
            : columns === 2
              ? "max-w-[170px]"
              : "max-w-[240px]";

    return (
        <div
            className={cn(
                "mt-3 grid w-full gap-1.5",
                width,
                columns === 1 && "grid-cols-1",
                columns === 2 && "grid-cols-2",
                columns === 3 && "grid-cols-3",
            )}
        >
            {visible.map((image, index) => (
                <button
                    key={image.name}
                    type="button"
                    onClick={() => onOpen(index)}
                    aria-label={`查看第 ${index + 1} 张图片`}
                    className="relative aspect-square overflow-hidden rounded-lg bg-muted"
                >
                    <img
                        src={image.thumbUrl}
                        alt=""
                        loading="lazy"
                        className="size-full object-cover"
                    />
                    {index === 8 && images.length > 9 && (
                        <span className="absolute inset-0 grid place-items-center bg-black/50 text-sm font-medium text-white">
                            +{images.length - 9}
                        </span>
                    )}
                </button>
            ))}
        </div>
    );
}

/** The tallest and widest shapes the tweet media strip will render. */
export const TWITTER_MEDIA_MIN_ASPECT = 3 / 4;
export const TWITTER_MEDIA_MAX_ASPECT = 16 / 9;
/**
 * A single photo and the two-up pair keep their own shape; only genuinely
 * extreme panoramas are capped so one image cannot dominate the card.
 */
export const TWITTER_NATURAL_MIN_ASPECT = 1 / 2.5;
export const TWITTER_NATURAL_MAX_ASPECT = 2.5;
/** Placeholder until the first photo reports its real size. */
export const TWITTER_MEDIA_DEFAULT_ASPECT = 4 / 3;

function hasSize(width: number, height: number) {
    return (
        Number.isFinite(width) &&
        Number.isFinite(height) &&
        width > 0 &&
        height > 0
    );
}

/**
 * The shared viewport shape of the tweet media strip: derived from the first
 * photo and clamped so one extreme image cannot make the whole card huge or a
 * thin sliver. Invalid sizes fall back to 4:3.
 */
export function twitterMediaAspect(width: number, height: number): number {
    if (!hasSize(width, height)) {
        return TWITTER_MEDIA_DEFAULT_ASPECT;
    }
    return Math.min(
        TWITTER_MEDIA_MAX_ASPECT,
        Math.max(TWITTER_MEDIA_MIN_ASPECT, width / height),
    );
}

/**
 * X keeps a two-up at one shared height when that height is still tall
 * enough. Two landscape photos would collapse into a thin band, so X sends
 * them to the same 80% swipe strip as larger sets instead. Measured on
 * x.com's phone layout: a 0.75 + 0.75 portrait pair and a 0.46 + 1.2 mixed
 * pair stay side by side, while a 1.18 + 1.16 landscape pair goes to the
 * strip — the cutoff sits around 1.8 in summed aspect.
 */
export const TWITTER_PAIR_MAX_ASPECT_SUM = 1.8;

/** Whether a two-photo post should keep X's equal-height side-by-side pair. */
export function twitterPairFits(left: number, right: number): boolean {
    if (!hasSize(left, 1) || !hasSize(right, 1)) return true;
    return left + right <= TWITTER_PAIR_MAX_ASPECT_SUM;
}

/**
 * The photo's own shape for the single and pair layouts, with a much wider
 * clamp than the strip: a 9:16 phone screenshot has to fit as-is.
 */
export function twitterNaturalAspect(width: number, height: number): number {
    if (!hasSize(width, height)) {
        return TWITTER_MEDIA_DEFAULT_ASPECT;
    }
    return Math.min(
        TWITTER_NATURAL_MAX_ASPECT,
        Math.max(TWITTER_NATURAL_MIN_ASPECT, width / height),
    );
}

/**
 * X-style tweet media, matched against x.com's phone layout:
 *
 * - one photo fills the text column at its natural shape with X's 16px radius;
 * - a pair sits there side by side at one shared height, each photo keeping
 *   its own width ratio, with X's 4px gutter and 8px per-photo radius; two
 *   landscape photos would be too short, so they use the strip below instead;
 * - three or more (and that wide pair) become a swipeable filmstrip that
 *   bleeds to the card edges while the first slide lines up with the text
 *   column. Slides share the first photo's aspect ratio, keep X's 4px gutter
 *   and 8px radius, and snap to the text column so the next one peeks in.
 *
 * Tapping a photo opens the viewer.
 */
export function TwitterMedia({ images, onOpen }: ImageListProps) {
    const [ratios, setRatios] = useState<Record<number, number>>({});

    const ratioAt = (index: number) =>
        ratios[index] ?? TWITTER_MEDIA_DEFAULT_ASPECT;

    /** Remember each photo's real shape as it loads. */
    const measure =
        (index: number, aspectOf = twitterMediaAspect) =>
        (event: SyntheticEvent<HTMLImageElement>) => {
            const photo = event.currentTarget;
            setRatios((previous) => ({
                ...previous,
                [index]: aspectOf(photo.naturalWidth, photo.naturalHeight),
            }));
        };

    if (images.length === 0) return null;

    if (images.length === 1) {
        const image = images[0];
        return (
            <div className="mt-3">
                <button
                    type="button"
                    onClick={() => onOpen(0)}
                    aria-label="查看图片"
                    style={{ aspectRatio: String(ratioAt(0)) }}
                    className="relative w-full overflow-hidden rounded-[16px] bg-muted"
                >
                    <img
                        src={image.url}
                        alt=""
                        loading="lazy"
                        onLoad={measure(0, twitterNaturalAspect)}
                        className="size-full object-cover"
                    />
                </button>
            </div>
        );
    }

    const pairMeasured = ratios[0] !== undefined && ratios[1] !== undefined;
    const keepPair =
        images.length === 2 &&
        (!pairMeasured || twitterPairFits(ratios[0], ratios[1]));

    if (keepPair) {
        return (
            // Growing each photo by its own ratio keeps both heights equal
            // while the widths stay proportional, so neither is cropped to the
            // other's shape (X's two-up layout, 4px gutter).
            <div className="mt-3 flex items-stretch gap-1">
                {images.map((image, index) => {
                    const ratio = ratioAt(index);
                    return (
                        <button
                            key={image.name}
                            type="button"
                            onClick={() => onOpen(index)}
                            aria-label={`查看第 ${index + 1} 张图片，共 2 张`}
                            style={{
                                aspectRatio: String(ratio),
                                flexBasis: 0,
                                flexGrow: ratio,
                            }}
                            className="relative min-w-0 overflow-hidden rounded-[8px] bg-muted"
                        >
                            <img
                                // The thumbnail is a square crop, so it can
                                // neither measure the real shape nor stand in
                                // for it here.
                                src={image.url}
                                alt=""
                                loading="lazy"
                                onLoad={measure(index, twitterNaturalAspect)}
                                className="size-full object-cover"
                            />
                        </button>
                    );
                })}
            </div>
        );
    }

    const aspect = ratioAt(0);

    return (
        // Break out of the tweet's text column (card padding + avatar + gap)
        // so the strip can run edge to edge, then pad the scroll content back
        // to that column: the first slide lines up with the text and the
        // neighbours peek out towards the card edges, as X does.
        <div className="mt-3 -mr-4 -ml-[4.25rem]">
            <div
                role="group"
                aria-label="图片，左右滑动查看"
                // `scroll-padding` matches the text-column offset, so a slide
                // that snaps lands on the text edge instead of the card edge
                // (X snaps its media strip the same way).
                className="flex snap-x snap-mandatory scroll-pr-4 scroll-pl-[4.25rem] [scrollbar-width:none] gap-1 overflow-x-auto pr-4 pl-[4.25rem] [&::-webkit-scrollbar]:hidden"
            >
                {images.map((image, index) => (
                    <button
                        key={image.name}
                        type="button"
                        onClick={() => onOpen(index)}
                        aria-label={`查看第 ${index + 1} 张图片，共 ${images.length} 张`}
                        style={{ aspectRatio: String(aspect) }}
                        className="relative w-[80%] shrink-0 snap-start overflow-hidden rounded-[8px] bg-muted"
                    >
                        <img
                            src={image.url}
                            alt=""
                            loading="lazy"
                            onLoad={index === 0 ? measure(0) : undefined}
                            className="size-full object-cover"
                        />
                    </button>
                ))}
            </div>
        </div>
    );
}

/**
 * Instagram-style full-bleed media. Multiple images form a native
 * scroll-snap carousel so no carousel dependency is needed.
 */
export function InstagramCarousel({ images, onOpen }: ImageListProps) {
    const stripRef = useRef<HTMLDivElement>(null);
    const [index, setIndex] = useState(0);

    if (images.length === 0) return null;

    const handleScroll = () => {
        const strip = stripRef.current;
        if (!strip) return;
        setIndex(Math.round(strip.scrollLeft / strip.clientWidth));
    };

    return (
        <div className="relative bg-muted">
            <div
                ref={stripRef}
                onScroll={handleScroll}
                className="flex snap-x snap-mandatory [scrollbar-width:none] overflow-x-auto [&::-webkit-scrollbar]:hidden"
            >
                {images.map((image, imageIndex) => (
                    <button
                        key={image.name}
                        type="button"
                        onClick={() => onOpen(imageIndex)}
                        aria-label={`查看第 ${imageIndex + 1} 张图片`}
                        className="w-full shrink-0 snap-center"
                    >
                        <img
                            src={image.url}
                            alt=""
                            loading="lazy"
                            className="aspect-square w-full object-cover"
                        />
                    </button>
                ))}
            </div>

            {images.length > 1 && (
                <>
                    <span className="absolute top-2 right-2 rounded-full bg-black/50 px-2 py-0.5 text-xs text-white">
                        {index + 1}/{images.length}
                    </span>
                    <div className="absolute inset-x-0 bottom-2 flex justify-center gap-1">
                        {images.map((image, imageIndex) => (
                            <span
                                key={image.name}
                                className={cn(
                                    "size-1.5 rounded-full transition-colors",
                                    imageIndex === index
                                        ? "bg-white"
                                        : "bg-white/50",
                                )}
                            />
                        ))}
                    </div>
                </>
            )}
        </div>
    );
}
