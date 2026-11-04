/**
 * Pure geometry and decision helpers for the full-screen image viewer.
 *
 * The viewer keeps the image centred with `translate(x, y) scale(s)`. The
 * origin is the centre of the viewport, so `x`/`y` are offsets from the
 * centre and the pan limits are derived from how far the scaled image
 * overflows the viewport on each axis.
 */

export const MIN_SCALE = 1;
export const MAX_SCALE = 4;
/** Scale a double tap zooms to (and back from). */
export const DOUBLE_TAP_SCALE = 2.5;
/** Scale below which a pinch release springs back to fit. */
export const SNAP_BACK_SCALE = 1.08;
/** Finger travel that commits a swipe to the neighbouring image. */
export const SWIPE_DISTANCE_RATIO = 0.18;
/** Fling speed (px/ms) that commits a swipe even over a short distance. */
export const SWIPE_VELOCITY = 0.45;
/** Finger travel that dismisses the viewer on release. */
export const DISMISS_DISTANCE = 110;
/** Fling speed (px/ms) that dismisses even over a short distance. */
export const DISMISS_VELOCITY = 0.55;

export type Point = { x: number; y: number };
export type Size = { width: number; height: number };
export type ZoomTransform = { scale: number; x: number; y: number };

export function clamp(value: number, min: number, max: number): number {
    const clamped = Math.min(Math.max(value, min), max);
    // Normalise -0 so the value can be interpolated into CSS cleanly.
    return clamped === 0 ? 0 : clamped;
}

export function clampScale(scale: number): number {
    return clamp(scale, MIN_SCALE, MAX_SCALE);
}

export function distance(a: Point, b: Point): number {
    return Math.hypot(b.x - a.x, b.y - a.y);
}

export function midpoint(a: Point, b: Point): Point {
    return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

/**
 * How far the scaled image may move on each axis before an edge would show.
 * Zero means the image still fits that axis and cannot pan.
 */
export function panLimits(scale: number, base: Size, viewport: Size): Point {
    return {
        x: Math.max(0, (base.width * scale - viewport.width) / 2),
        y: Math.max(0, (base.height * scale - viewport.height) / 2),
    };
}

/**
 * Keep the image covering the viewport: once it is larger than the viewport
 * it may pan up to the overflow, but never reveal the background.
 */
export function clampTranslation(
    transform: ZoomTransform,
    base: Size,
    viewport: Size,
): ZoomTransform {
    const limit = panLimits(transform.scale, base, viewport);
    return {
        scale: transform.scale,
        x: clamp(transform.x, -limit.x, limit.x),
        y: clamp(transform.y, -limit.y, limit.y),
    };
}

/**
 * Zoom while keeping the tapped point pinned. `point` is relative to the
 * viewport centre, matching the transform's origin.
 */
export function zoomAtPoint(
    current: ZoomTransform,
    point: Point,
    nextScale: number,
    base: Size,
    viewport: Size,
): ZoomTransform {
    const scale = clampScale(nextScale);
    const ratio = scale / current.scale;
    return clampTranslation(
        {
            scale,
            x: point.x - ratio * (point.x - current.x),
            y: point.y - ratio * (point.y - current.y),
        },
        base,
        viewport,
    );
}

/**
 * Which image the swipe should land on: -1 previous, 0 stay, 1 next.
 */
export function resolveSwipe(
    dx: number,
    velocity: number,
    width: number,
): -1 | 0 | 1 {
    const travelled = Math.abs(dx) >= width * SWIPE_DISTANCE_RATIO;
    const flicked = Math.abs(velocity) >= SWIPE_VELOCITY;
    if (!travelled && !flicked) return 0;
    // A slow long drag is judged by distance; a quick flick by its direction.
    const direction = Math.abs(dx) > 12 ? Math.sign(dx) : Math.sign(velocity);
    return direction < 0 ? 1 : -1;
}

/** Whether releasing a downward drag should close the viewer. */
export function shouldDismiss(dy: number, velocity: number): boolean {
    return dy >= DISMISS_DISTANCE || (dy > 32 && velocity >= DISMISS_VELOCITY);
}
