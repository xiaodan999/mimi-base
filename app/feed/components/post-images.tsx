import { ChevronLeft, ChevronRight } from "lucide-react";
import {
    type SyntheticEvent,
    useCallback,
    useEffect,
    useRef,
    useState,
} from "react";

import { videoDisplayRatio } from "@/lib/postMedia";
import { cn } from "@/lib/utils";

import { indexMediaByKind } from "../utils";
import PostVideo from "./post-video";

/**
 * One media item of a post, with the protected URLs already built. The list
 * order is the stored order (`posts.media_order`), so a video can sit between
 * two photos.
 */
export type PostMediaView =
    | {
          type: "image";
          name: string;
          /** The full-size original, which is already a compressed WebP. */
          url: string;
          /** 600px grid thumbnail, or the original when there is no thumb. */
          thumbUrl: string;
          /**
           * Intrinsic size recorded at upload. When present the media box is
           * painted at its real aspect, so loading cannot shift the feed.
           */
          width?: number;
          height?: number;
      }
    | {
          type: "video";
          name: string;
          /** Protected file URL, already carrying the short-lived token. */
          url: string;
          width?: number;
          height?: number;
      };

type MediaListProps = {
    media: PostMediaView[];
    /** Image viewer index (counted among photos only). */
    onOpenImage: (index: number) => void;
    /** Video viewer index (counted among videos only). */
    onOpenVideo: (index: number) => void;
};

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
 * medium and clamped so one extreme image cannot make the whole card huge or
 * a thin sliver. Invalid sizes fall back to 4:3.
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

export type TwitterMediaPlan = "single" | "pair" | "strip";

/**
 * Which of X's media layouts an ordered set of media gets:
 *
 * - one medium fills the column (a lone video is still the normal player);
 * - exactly one photo plus one video keep X's equal-height row — measured on
 *   x.com, a 680x313 photo and a 480x852 video shared one height side by side,
 *   with the row's aspect the sum of the two (2.74) rather than the strip; the
 *   order is the author's, so either can lead;
 * - two photos keep that pair only when `twitterPairFits`;
 * - everything else, including two or more videos, is the swipeable strip,
 *   where each video is just one more slide.
 */
export function twitterMediaPlan(input: {
    imageCount: number;
    videoCount: number;
    /** `twitterPairFits` for the two photos; ignored once a video is present. */
    pairFits: boolean;
}): TwitterMediaPlan {
    const count = input.imageCount + input.videoCount;
    if (count <= 1) return "single";
    if (input.videoCount === 1 && input.imageCount === 1) return "pair";
    if (input.videoCount === 0) {
        return input.imageCount === 2 && input.pairFits ? "pair" : "strip";
    }
    return "strip";
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
 * - one medium fills the text column at its natural shape with X's 16px radius;
 * - a pair sits there side by side at one shared height, each medium keeping
 *   its own width ratio, with X's 4px gutter and 8px per-tile radius; two
 *   landscape photos would be too short, so they use the strip below instead;
 * - a post with one photo and one video uses that same pair, each slot keeping
 *   its own ratio and the author's order (see `twitterMediaPlan`);
 * - three or more, two or more videos, and the wide photo pair become a
 *   swipeable filmstrip that bleeds to the card edges while the first slide
 *   lines up with the text column. Slides share the first slide's aspect
 *   ratio, keep X's 4px gutter and 8px radius, and snap to the text column so
 *   the next one peeks in.
 *
 * Photos and videos are rendered in the stored order, so a clip can lead, sit
 * between photos, or come last. A video fills its slide box rather than sizing
 * itself, autoplays muted when visible (as in the single-video card) and opens
 * the viewer on a tap. Tapping a photo opens the image viewer at that photo.
 */
export function TwitterMedia({
    media,
    onOpenImage,
    onOpenVideo,
}: MediaListProps) {
    const [ratios, setRatios] = useState<Record<number, number>>({});
    const stripRef = useRef<HTMLDivElement>(null);
    const [canPrev, setCanPrev] = useState(false);
    const [canNext, setCanNext] = useState(false);

    const indexed = indexMediaByKind(media);
    const imageCount = media.filter((item) => item.type === "image").length;
    const videoCount = media.length - imageCount;

    const sizeAt = (index: number) => {
        const item = media[index];
        return item?.width && item.height
            ? { width: item.width, height: item.height }
            : null;
    };

    /**
     * The aspect to paint before the photo loads: a measured value wins, then
     * the size recorded with the post, then the 4:3 placeholder for old posts.
     */
    const ratioAt = (index: number, aspectOf = twitterMediaAspect) => {
        const measured = ratios[index];
        if (measured !== undefined) return measured;
        const size = sizeAt(index);
        return size
            ? aspectOf(size.width, size.height)
            : TWITTER_MEDIA_DEFAULT_ASPECT;
    };

    /** The clip's real shape once it reports metadata; stored size until then. */
    const videoRatioAt = (index: number) => {
        const measured = ratios[index];
        if (measured !== undefined) return measured;
        const size = sizeAt(index);
        return videoDisplayRatio(size?.width ?? 0, size?.height ?? 0);
    };

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

    const measureVideo = (index: number) => (ratio: number) =>
        setRatios((previous) => ({ ...previous, [index]: ratio }));

    const pairKnown =
        media.length === 2 &&
        media.every(
            (_, index) => ratios[index] !== undefined || sizeAt(index) !== null,
        );
    const keepPair =
        media.length === 2 &&
        media.every((item) => item.type === "image") &&
        (!pairKnown ||
            twitterPairFits(
                ratioAt(0, twitterNaturalAspect),
                ratioAt(1, twitterNaturalAspect),
            ));
    const plan = twitterMediaPlan({
        imageCount,
        videoCount,
        pairFits: keepPair,
    });
    const showStrip = plan === "strip";

    /** Keep the hover arrows honest as the strip scrolls or resizes. */
    const updateArrows = useCallback(() => {
        const strip = stripRef.current;
        if (!strip) return;
        setCanPrev(strip.scrollLeft > 1);
        setCanNext(
            strip.scrollLeft + strip.clientWidth < strip.scrollWidth - 1,
        );
    }, []);

    useEffect(() => {
        if (!showStrip) return;
        const strip = stripRef.current;
        if (!strip) return;
        updateArrows();
        const observer = new ResizeObserver(updateArrows);
        observer.observe(strip);
        return () => observer.disconnect();
    }, [showStrip, updateArrows]);

    const scrollStrip = (direction: 1 | -1) => {
        const strip = stripRef.current;
        if (!strip) return;
        const slide = strip.firstElementChild as HTMLElement | null;
        // One slide plus the 4px gutter is exactly the next snap position.
        const amount = (slide?.offsetWidth ?? strip.clientWidth) + 4;
        strip.scrollBy({ left: amount * direction, behavior: "smooth" });
    };

    if (media.length === 0) return null;

    if (plan === "single") {
        const entry = indexed[0];
        if (!entry) return null;
        if (entry.item.type === "video") {
            return (
                <div className="mt-3">
                    <PostVideo
                        url={entry.item.url}
                        layout="twitter"
                        videoWidth={entry.item.width}
                        videoHeight={entry.item.height}
                        onAspect={measureVideo(0)}
                        onOpenFullscreen={() => onOpenVideo(entry.index)}
                    />
                </div>
            );
        }
        return (
            <div className="mt-3">
                <button
                    type="button"
                    onClick={() => onOpenImage(entry.index)}
                    aria-label="查看图片"
                    style={{
                        aspectRatio: String(ratioAt(0, twitterNaturalAspect)),
                    }}
                    className="relative w-full overflow-hidden rounded-[16px] bg-muted"
                >
                    <img
                        src={entry.item.url}
                        alt=""
                        loading="lazy"
                        onLoad={measure(0, twitterNaturalAspect)}
                        className="size-full object-cover"
                    />
                </button>
            </div>
        );
    }

    if (plan === "pair") {
        return (
            // Growing each medium by its own ratio keeps both heights equal
            // while the widths stay proportional, so neither is cropped to the
            // other's shape (X's two-up layout, 4px gutter).
            <div className="mt-3 flex items-stretch gap-1">
                {indexed.map((entry, index) => {
                    const ratio =
                        entry.item.type === "image"
                            ? ratioAt(index, twitterNaturalAspect)
                            : videoRatioAt(index);
                    if (entry.item.type === "video") {
                        return (
                            <div
                                key={`video:${entry.item.name}`}
                                style={{
                                    aspectRatio: String(ratio),
                                    flexBasis: 0,
                                    flexGrow: ratio,
                                }}
                                className="relative min-w-0 overflow-hidden rounded-[8px] bg-black"
                            >
                                <PostVideo
                                    url={entry.item.url}
                                    layout="twitter"
                                    tile
                                    videoWidth={entry.item.width}
                                    videoHeight={entry.item.height}
                                    onAspect={measureVideo(index)}
                                    onOpenFullscreen={() =>
                                        onOpenVideo(entry.index)
                                    }
                                />
                            </div>
                        );
                    }
                    return (
                        <button
                            key={`image:${entry.item.name}`}
                            type="button"
                            onClick={() => onOpenImage(entry.index)}
                            aria-label={`查看第 ${entry.index + 1} 张图片，共 ${imageCount} 张`}
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
                                src={entry.item.url}
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

    // The strip shares one box, taken from its leading slide and clamped like
    // the photos so one extreme clip cannot make every slide hundreds of
    // pixels tall.
    const first = media[0];
    const aspect =
        first?.type === "video"
            ? Math.min(
                  TWITTER_MEDIA_MAX_ASPECT,
                  Math.max(TWITTER_MEDIA_MIN_ASPECT, videoRatioAt(0)),
              )
            : ratioAt(0);

    return (
        // Break out of the tweet's text column (card padding + avatar + gap)
        // so the strip can run edge to edge, then pad the scroll content back
        // to that column: the first slide lines up with the text and the
        // neighbours peek out towards the card edges, as X does.
        <div className="group relative mt-3 -mr-4 -ml-[4.25rem]">
            <div
                ref={stripRef}
                role="group"
                aria-label={
                    videoCount > 0
                        ? "视频和图片，左右滑动查看"
                        : "图片，左右滑动查看"
                }
                onScroll={updateArrows}
                // `scroll-padding` matches the text-column offset, so a slide
                // that snaps lands on the text edge instead of the card edge
                // (X snaps its media strip the same way).
                className="flex snap-x snap-mandatory scroll-pr-4 scroll-pl-[4.25rem] [scrollbar-width:none] gap-1 overflow-x-auto pr-4 pl-[4.25rem] [&::-webkit-scrollbar]:hidden"
            >
                {indexed.map((entry, index) =>
                    entry.item.type === "video" ? (
                        <div
                            key={`video:${entry.item.name}`}
                            style={{ aspectRatio: String(aspect) }}
                            className="relative w-[80%] shrink-0 snap-start overflow-hidden rounded-[8px] bg-black"
                        >
                            <PostVideo
                                url={entry.item.url}
                                layout="twitter"
                                tile
                                videoWidth={entry.item.width}
                                videoHeight={entry.item.height}
                                onAspect={measureVideo(index)}
                                onOpenFullscreen={() =>
                                    onOpenVideo(entry.index)
                                }
                            />
                        </div>
                    ) : (
                        <button
                            key={`image:${entry.item.name}`}
                            type="button"
                            onClick={() => onOpenImage(entry.index)}
                            aria-label={`查看第 ${entry.index + 1} 张图片，共 ${imageCount} 张`}
                            style={{ aspectRatio: String(aspect) }}
                            className="relative w-[80%] shrink-0 snap-start overflow-hidden rounded-[8px] bg-muted"
                        >
                            <img
                                src={entry.item.url}
                                alt=""
                                loading="lazy"
                                onLoad={index === 0 ? measure(0) : undefined}
                                className="size-full object-cover"
                            />
                        </button>
                    ),
                )}
            </div>

            {/* X shows these only on hover-capable devices and fades out the
                arrow that cannot go further (there is no left arrow on the
                first slide or right arrow on the last). v4's hover variants
                already live behind `@media (hover: hover)`, so a tap on a
                phone never surfaces them. Keyboard focus reveals the enabled
                one too. */}
            <button
                type="button"
                disabled={!canPrev}
                onClick={() => scrollStrip(-1)}
                aria-label="上一张图片"
                className={cn(
                    "absolute top-1/2 left-[4.375rem] z-10 grid size-9 -translate-y-1/2 place-items-center rounded-full bg-black/75 text-white opacity-0 transition-opacity duration-200 focus-visible:opacity-100",
                    canPrev
                        ? "pointer-events-none group-hover:pointer-events-auto group-hover:opacity-100"
                        : "pointer-events-none",
                )}
            >
                <ChevronLeft className="size-5" aria-hidden="true" />
            </button>
            <button
                type="button"
                disabled={!canNext}
                onClick={() => scrollStrip(1)}
                aria-label="下一张图片"
                className={cn(
                    "absolute top-1/2 right-[1.125rem] z-10 grid size-9 -translate-y-1/2 place-items-center rounded-full bg-black/75 text-white opacity-0 transition-opacity duration-200 focus-visible:opacity-100",
                    canNext
                        ? "pointer-events-none group-hover:pointer-events-auto group-hover:opacity-100"
                        : "pointer-events-none",
                )}
            >
                <ChevronRight className="size-5" aria-hidden="true" />
            </button>
        </div>
    );
}

/**
 * Instagram-style full-bleed media. Photos and videos share one native
 * scroll-snap carousel, in the stored order: photos fill a square slide and a
 * clip is letterboxed in the same square with its own inline controls (a
 * single clip is drawn by the caller at full size instead). The counter and
 * dots cover the whole media set, not just the photos.
 */
export function InstagramCarousel({
    media,
    onOpenImage,
    onOpenVideo,
}: MediaListProps) {
    const stripRef = useRef<HTMLDivElement>(null);
    const [index, setIndex] = useState(0);

    if (media.length === 0) return null;

    const handleScroll = () => {
        const strip = stripRef.current;
        if (!strip) return;
        setIndex(Math.round(strip.scrollLeft / strip.clientWidth));
    };

    const indexed = indexMediaByKind(media);

    return (
        <div className="relative bg-muted">
            <div
                ref={stripRef}
                onScroll={handleScroll}
                className="flex snap-x snap-mandatory [scrollbar-width:none] overflow-x-auto [&::-webkit-scrollbar]:hidden"
            >
                {indexed.map((entry) =>
                    entry.item.type === "video" ? (
                        <div
                            key={`video:${entry.item.name}`}
                            className="aspect-square w-full shrink-0 snap-center bg-black"
                        >
                            <PostVideo
                                url={entry.item.url}
                                layout="instagram"
                                tile
                                videoWidth={entry.item.width}
                                videoHeight={entry.item.height}
                                onOpenFullscreen={() =>
                                    onOpenVideo(entry.index)
                                }
                            />
                        </div>
                    ) : (
                        <button
                            key={`image:${entry.item.name}`}
                            type="button"
                            onClick={() => onOpenImage(entry.index)}
                            aria-label={`查看第 ${entry.index + 1} 张图片`}
                            className="w-full shrink-0 snap-center"
                        >
                            <img
                                src={entry.item.url}
                                alt=""
                                loading="lazy"
                                className="aspect-square w-full object-cover"
                            />
                        </button>
                    ),
                )}
            </div>

            {media.length > 1 && (
                <>
                    <span
                        data-testid="carousel-counter"
                        className="absolute top-2 right-2 rounded-full bg-black/50 px-2 py-0.5 text-xs text-white tabular-nums"
                    >
                        {index + 1}/{media.length}
                    </span>
                    <div className="absolute inset-x-0 bottom-2 flex justify-center gap-1">
                        {media.map((item, dotIndex) => (
                            <span
                                key={`${item.type}:${item.name}`}
                                className={cn(
                                    "size-1.5 rounded-full transition-colors",
                                    dotIndex === index
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
