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

import PostVideo from "./post-video";

export type PostImageView = {
    name: string;
    /** The full-size original, which is already a compressed WebP upload. */
    url: string;
    /** 600px grid thumbnail, or the original when the post has no thumb. */
    thumbUrl: string;
    /**
     * Intrinsic size recorded at upload. When present the media box is
     * painted at its real aspect, so loading the photo cannot shift the feed.
     */
    width?: number;
    height?: number;
};

type ImageListProps = {
    images: PostImageView[];
    onOpen: (index: number) => void;
};

/** The post's single video, as one more slide in the same media set. */
export type PostVideoView = {
    /** Protected file URL, already carrying the short-lived token. */
    url: string;
    width?: number;
    height?: number;
};

type TwitterMediaProps = ImageListProps & {
    video?: PostVideoView | null;
    onOpenVideo?: () => void;
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

export type TwitterMediaPlan = "single" | "pair" | "strip";

/**
 * Which of X's media layouts a post's set of media gets:
 *
 * - one medium fills the column; a lone video is drawn by `PostVideo` without
 *   a row or strip around it;
 * - exactly one photo plus the video keep X's equal-height row — measured on
 *   x.com, a 680x313 photo and a 480x852 video shared one height side by side,
 *   with the row's aspect the sum of the two (2.74) rather than the strip;
 * - any other mix (and the two-photo sets too wide for the row) becomes the
 *   swipeable strip, where the video is just one more slide.
 */
export function twitterMediaPlan(input: {
    imageCount: number;
    hasVideo: boolean;
    /** `twitterPairFits` for the two photos; ignored once a video is present. */
    pairFits: boolean;
}): TwitterMediaPlan {
    const count = input.imageCount + (input.hasVideo ? 1 : 0);
    if (count <= 1) return "single";
    if (input.hasVideo) return input.imageCount === 1 ? "pair" : "strip";
    return input.imageCount === 2 && input.pairFits ? "pair" : "strip";
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
 * - a post with one photo and its video uses that same pair, each slot keeping
 *   its own ratio (see `twitterMediaPlan`);
 * - three or more (and that wide pair) become a swipeable filmstrip that
 *   bleeds to the card edges while the first slide lines up with the text
 *   column. Slides share the first slide's aspect ratio, keep X's 4px gutter
 *   and 8px radius, and snap to the text column so the next one peeks in.
 *
 * The clip leads the set, then the photos. x.com keeps whatever order the
 * author attached the media in — its "My little hamster" post is a landscape
 * video followed by a portrait photo, its "My cute little dog" post the other
 * way round — and `posts.images` / `posts.videos` cannot express a mixed
 * order, so the video goes first.
 *
 * The video fills its slide box rather than sizing itself, autoplays muted
 * when visible (as in the single-video card) and opens the viewer on a tap.
 * Tapping a photo opens the image viewer.
 */
export function TwitterMedia({
    images,
    video,
    onOpen,
    onOpenVideo,
}: TwitterMediaProps) {
    const [ratios, setRatios] = useState<Record<number, number>>({});
    /** The clip's real shape once it reports metadata; stored size until then. */
    const [videoRatio, setVideoRatio] = useState<number | null>(null);
    const stripRef = useRef<HTMLDivElement>(null);
    const [canPrev, setCanPrev] = useState(false);
    const [canNext, setCanNext] = useState(false);

    const hasVideo = Boolean(video?.url);
    const videoAspect =
        videoRatio ?? videoDisplayRatio(video?.width ?? 0, video?.height ?? 0);

    const sizeAt = (index: number) => {
        const image = images[index];
        return image?.width && image.height
            ? { width: image.width, height: image.height }
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

    const pairKnown =
        (ratios[0] !== undefined || sizeAt(0) !== null) &&
        (ratios[1] !== undefined || sizeAt(1) !== null);
    const keepPair =
        images.length === 2 &&
        (!pairKnown ||
            twitterPairFits(
                ratioAt(0, twitterNaturalAspect),
                ratioAt(1, twitterNaturalAspect),
            ));
    const plan = twitterMediaPlan({
        imageCount: images.length,
        hasVideo,
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

    /** The clip as one slide; its wrapper owns the slide box. */
    const videoSlide = video ? (
        <PostVideo
            url={video.url}
            layout="twitter"
            tile
            videoWidth={video.width}
            videoHeight={video.height}
            onAspect={setVideoRatio}
            onOpenFullscreen={() => onOpenVideo?.()}
        />
    ) : null;

    if (images.length === 0) return null;

    if (plan === "single") {
        // A lone video never reaches here: the post renders `PostVideo` itself.
        const image = images[0];
        if (!image) return null;
        return (
            <div className="mt-3">
                <button
                    type="button"
                    onClick={() => onOpen(0)}
                    aria-label="查看图片"
                    style={{
                        aspectRatio: String(ratioAt(0, twitterNaturalAspect)),
                    }}
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

    if (plan === "pair") {
        return (
            // Growing each medium by its own ratio keeps both heights equal
            // while the widths stay proportional, so neither is cropped to the
            // other's shape (X's two-up layout, 4px gutter).
            <div className="mt-3 flex items-stretch gap-1">
                {video && (
                    // The clip leads the row at its own ratio, so the pair
                    // still shares one height and 4px gutter.
                    <div
                        style={{
                            aspectRatio: String(videoAspect),
                            flexBasis: 0,
                            flexGrow: videoAspect,
                        }}
                        className="relative min-w-0 overflow-hidden rounded-[8px] bg-black"
                    >
                        {videoSlide}
                    </div>
                )}
                {images.map((image, index) => {
                    const ratio = ratioAt(index, twitterNaturalAspect);
                    return (
                        <button
                            key={image.name}
                            type="button"
                            onClick={() => onOpen(index)}
                            aria-label={`查看第 ${index + 1} 张图片，共 ${images.length} 张`}
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

    // The strip shares one box, taken from its leading slide and clamped like
    // the photos so one extreme clip cannot make every slide hundreds of
    // pixels tall.
    const aspect = hasVideo
        ? Math.min(
              TWITTER_MEDIA_MAX_ASPECT,
              Math.max(TWITTER_MEDIA_MIN_ASPECT, videoAspect),
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
                    hasVideo ? "视频和图片，左右滑动查看" : "图片，左右滑动查看"
                }
                onScroll={updateArrows}
                // `scroll-padding` matches the text-column offset, so a slide
                // that snaps lands on the text edge instead of the card edge
                // (X snaps its media strip the same way).
                className="flex snap-x snap-mandatory scroll-pr-4 scroll-pl-[4.25rem] [scrollbar-width:none] gap-1 overflow-x-auto pr-4 pl-[4.25rem] [&::-webkit-scrollbar]:hidden"
            >
                {video && (
                    <div
                        style={{ aspectRatio: String(aspect) }}
                        className="relative w-[80%] shrink-0 snap-start overflow-hidden rounded-[8px] bg-black"
                    >
                        {videoSlide}
                    </div>
                )}
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
