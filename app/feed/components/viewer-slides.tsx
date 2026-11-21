import type { RefObject } from "react";

import type { Point, ZoomTransform } from "./viewer-gestures";

type Props = {
    images: { name: string; url: string }[];
    current: number;
    zoom: ZoomTransform;
    drag: Point;
    trackRef: RefObject<HTMLDivElement | null>;
    imageRef: RefObject<HTMLImageElement | null>;
    measure: () => void;
    trackTransform: (target: number, offset: Point) => string;
    imageTransform: (value: ZoomTransform) => string;
};

/** The carousel track and its slides; gestures live in the viewer. */
export default function ViewerSlides({
    images,
    current,
    zoom,
    drag,
    trackRef,
    imageRef,
    measure,
    trackTransform,
    imageTransform,
}: Props) {
    return (
        <div
            ref={trackRef}
            className="absolute inset-0 flex will-change-transform"
            style={{
                transform: trackTransform(current, drag),
            }}
        >
            {images.map((image, imageIndex) => (
                <div
                    key={image.name}
                    className="relative flex h-full w-full shrink-0 items-center justify-center"
                >
                    <img
                        ref={imageIndex === current ? imageRef : undefined}
                        src={image.url}
                        alt=""
                        draggable={false}
                        decoding="async"
                        onLoad={measure}
                        className="max-h-full max-w-full object-contain select-none [-webkit-touch-callout:none]"
                        style={
                            imageIndex === current
                                ? {
                                      transform: imageTransform(zoom),
                                  }
                                : undefined
                        }
                    />
                </div>
            ))}
        </div>
    );
}
