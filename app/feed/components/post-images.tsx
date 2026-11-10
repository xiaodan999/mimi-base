import { useRef, useState } from "react";

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
/** Placeholder until the first photo reports its real size. */
export const TWITTER_MEDIA_DEFAULT_ASPECT = 4 / 3;

/**
 * The shared viewport shape of the tweet media strip: derived from the first
 * photo and clamped so one extreme image cannot make the whole card huge or a
 * thin sliver. Invalid sizes fall back to 4:3.
 */
export function twitterMediaAspect(width: number, height: number): number {
    if (
        !Number.isFinite(width) ||
        !Number.isFinite(height) ||
        width <= 0 ||
        height <= 0
    ) {
        return TWITTER_MEDIA_DEFAULT_ASPECT;
    }
    return Math.min(
        TWITTER_MEDIA_MAX_ASPECT,
        Math.max(TWITTER_MEDIA_MIN_ASPECT, width / height),
    );
}

/**
 * X-style inline media: a horizontally swipeable filmstrip. Each slide is a
 * little under two thirds of the card, so the neighbouring photos peek from
 * both edges while the current one snaps to the centre; a single photo simply
 * fills the card. The strip is full-bleed inside the card, and every slide
 * shares the first photo's aspect ratio (clamped) so the row keeps one
 * height. Tapping a slide opens the full-screen viewer.
 */
export function TwitterImageCarousel({ images, onOpen }: ImageListProps) {
    const [aspect, setAspect] = useState(TWITTER_MEDIA_DEFAULT_ASPECT);

    if (images.length === 0) return null;

    const multiple = images.length > 1;

    return (
        // Break out of the tweet's text column (card padding + avatar + gap)
        // so the strip runs edge to edge inside the card, as X does.
        <div className="mt-3 -mr-4 -ml-[4.25rem]">
            <div
                role={multiple ? "group" : undefined}
                aria-label={multiple ? "图片，左右滑动查看" : undefined}
                className={cn(
                    multiple &&
                        "flex snap-x snap-mandatory [scrollbar-width:none] gap-2 overflow-x-auto [&::-webkit-scrollbar]:hidden",
                )}
            >
                {images.map((image, index) => (
                    <button
                        key={image.name}
                        type="button"
                        onClick={() => onOpen(index)}
                        aria-label={
                            multiple
                                ? `查看第 ${index + 1} 张图片，共 ${images.length} 张`
                                : "查看图片"
                        }
                        style={{ aspectRatio: String(aspect) }}
                        className={cn(
                            "relative shrink-0 overflow-hidden rounded-xl bg-muted",
                            multiple ? "w-[63%] snap-center" : "w-full",
                        )}
                    >
                        <img
                            src={image.url}
                            alt=""
                            loading="lazy"
                            onLoad={
                                index === 0
                                    ? (event) => {
                                          const photo = event.currentTarget;
                                          setAspect(
                                              twitterMediaAspect(
                                                  photo.naturalWidth,
                                                  photo.naturalHeight,
                                              ),
                                          );
                                      }
                                    : undefined
                            }
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
