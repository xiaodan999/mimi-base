export type CropOffset = { x: number; y: number };

export type CropGeometry = {
    /** Square viewport size in CSS pixels. */
    viewport: number;
    naturalWidth: number;
    naturalHeight: number;
    /** 1 = the image just covers the viewport. */
    zoom: number;
};

function clamp(value: number, min: number, max: number) {
    const result = Math.min(max, Math.max(min, value));
    // Normalize -0 so equality checks and rendered inline styles stay sane.
    return result === 0 ? 0 : result;
}

/**
 * Scale factor that makes the source image cover the square viewport.
 * Returns 0 for unsized images so callers can wait for `onLoad`.
 */
export function coverScale(
    viewport: number,
    width: number,
    height: number,
): number {
    if (viewport <= 0 || width <= 0 || height <= 0) return 0;
    return Math.max(viewport / width, viewport / height);
}

/** Keep the image edge glued to the viewport edge while dragging. */
export function clampOffset(
    offset: CropOffset,
    viewport: number,
    width: number,
    height: number,
    zoom: number,
): CropOffset {
    const scale = coverScale(viewport, width, height) * zoom;
    const maxX = Math.max(0, (width * scale - viewport) / 2);
    const maxY = Math.max(0, (height * scale - viewport) / 2);
    return {
        x: clamp(offset.x, -maxX, maxX),
        y: clamp(offset.y, -maxY, maxY),
    };
}

/**
 * Source rectangle (natural pixels) that is visible in the viewport. Feed it
 * straight to `ctx.drawImage(image, sx, sy, sw, sh, 0, 0, out, out)`.
 */
export function cropRect(geometry: CropGeometry, offset: CropOffset) {
    const {
        viewport,
        naturalWidth: width,
        naturalHeight: height,
        zoom,
    } = geometry;
    const scale = coverScale(viewport, width, height) * zoom;

    if (scale <= 0) {
        return { sx: 0, sy: 0, sw: 1, sh: 1 };
    }

    const side = Math.min(viewport / scale, width, height);
    const maxSx = Math.max(0, width - side);
    const maxSy = Math.max(0, height - side);
    // Offsets are CSS pixels; divide by the draw scale to get natural pixels.
    const left = (width * scale - viewport) / 2 - offset.x;
    const top = (height * scale - viewport) / 2 - offset.y;

    return {
        sx: clamp(left / scale, 0, maxSx),
        sy: clamp(top / scale, 0, maxSy),
        sw: side,
        sh: side,
    };
}
