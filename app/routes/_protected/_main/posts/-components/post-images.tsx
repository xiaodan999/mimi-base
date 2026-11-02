import { useRef, useState } from "react";

import { cn } from "@/lib/utils";

export type PostImageView = {
    name: string;
    thumbUrl: string;
    mediumUrl: string;
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
                "mt-2 grid w-full gap-1",
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
                    className="relative aspect-square overflow-hidden rounded-sm bg-muted"
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
        <div className="relative bg-black">
            <div
                ref={stripRef}
                onScroll={handleScroll}
                className="flex snap-x snap-mandatory overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
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
                            src={image.mediumUrl}
                            alt=""
                            loading="lazy"
                            className="aspect-square w-full object-cover"
                        />
                    </button>
                ))}
            </div>

            {images.length > 1 && (
                <>
                    <span className="absolute right-2 top-2 rounded-full bg-black/50 px-2 py-0.5 text-xs text-white">
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
