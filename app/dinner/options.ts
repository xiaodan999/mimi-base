/**
 * Pure logic for the 晚餐抽奖机. The UI (SVG wheel) and the PocketBase data
 * layer both import from here; everything is deterministic so the wheel math
 * and option validation can be unit tested without a browser.
 */

/** Seeded into `dinner_options` the first time the shared list is empty. */
export const DINNER_SEED = [
    "螺蛳粉",
    "塔斯丁",
    "肯德基",
    "酸菜鱼",
    "方便面",
    "煮饭",
    "烤鸡腿",
    "沙县小吃",
    "面总管",
    "烧烤",
    "披萨",
    "水果",
    "蔬菜沙拉",
    "喜姐烤串",
    "徽派",
    "奶茶",
    "咖喱饭",
    "兰州拉面",
    "李记麻辣烫",
    "杨国福麻辣烫",
    "老北京火锅",
    "酸辣粉",
    "小龙虾",
    "李记一绝臭豆腐",
    "胖哥俩",
    "瘦肉丸",
    "泡泡酸辣粉",
    "面包",
] as const;

export const MAX_DINNER_NAME_LENGTH = 24;

/** How many slices use a distinct color before the palette repeats. */
export const WHEEL_PALETTE_SIZE = 6;

export type DinnerOption = {
    id: string;
    name: string;
    created?: string;
};

/** Collapse whitespace and trim, so " 火 锅 " and "火锅" are the same option. */
export function normalizeDinnerName(raw: string): string {
    return raw.replace(/\s+/g, " ").trim();
}

/**
 * Returns a user-facing error, or null when the name can be added/renamed.
 * `options` is the current list; pass `ignoreId` while renaming that row.
 */
export function dinnerNameError(
    raw: string,
    options: readonly Pick<DinnerOption, "id" | "name">[],
    ignoreId?: string,
): string | null {
    const name = normalizeDinnerName(raw);
    if (!name) return "先写一个想吃的吧";
    if (Array.from(name).length > MAX_DINNER_NAME_LENGTH) {
        return `名字最多 ${MAX_DINNER_NAME_LENGTH} 个字`;
    }
    const key = name.toLocaleLowerCase();
    const duplicate = options.some(
        (option) =>
            option.id !== ignoreId &&
            normalizeDinnerName(option.name).toLocaleLowerCase() === key,
    );
    return duplicate ? "这个已经在转盘上了" : null;
}

/** Degrees covered by one slice. */
export function segmentAngle(count: number): number {
    return count > 0 ? 360 / count : 0;
}

/**
 * Center of slice `index`, in degrees clockwise from the top (the pointer).
 * Slice 0 starts at the top, so its center sits half a slice clockwise.
 */
export function segmentCenterAngle(index: number, count: number): number {
    if (count <= 0) return 0;
    return ((index + 0.5) * 360) / count;
}

/** Wrap any angle into [0, 360). */
export function normalizeAngle(degrees: number): number {
    return ((degrees % 360) + 360) % 360;
}

/**
 * Next rotation for the wheel so slice `index` stops under the pointer.
 *
 * The wheel rotates clockwise, so a slice center at `segmentCenterAngle`
 * needs a rotation of `-center` (mod 360). We always add `extraTurns` full
 * turns so the spin reads as a spin, and keep the result strictly greater
 * than the current rotation so the CSS transition never animates backwards.
 *
 * `jitterDegrees` offsets the landing point inside the slice, which makes a
 * spin look less mechanical. Callers keep it below half a slice so the
 * chosen slice still wins.
 */
export function rotationForIndex(
    index: number,
    count: number,
    currentRotation: number,
    extraTurns = 5,
    jitterDegrees = 0,
): number {
    if (count <= 0) return currentRotation;
    const center = segmentCenterAngle(index, count) + jitterDegrees;
    const target = normalizeAngle(-center);
    const current = normalizeAngle(currentRotation);
    const delta = normalizeAngle(target - current);
    return currentRotation + extraTurns * 360 + delta;
}

/** Uniform random slice index; `-1` when there is nothing to pick. */
export function randomIndex(count: number, rng: () => number = Math.random) {
    if (count <= 0) return -1;
    return Math.min(count - 1, Math.floor(rng() * count));
}

/**
 * One spin: the chosen slice plus the exact rotation the wheel must end on.
 * Jitter stays within a quarter slice on either side of the center.
 */
export function spinPlan(
    count: number,
    currentRotation: number,
    rng: () => number = Math.random,
    extraTurns = 5,
): { index: number; rotation: number; jitter: number } {
    const index = randomIndex(count, rng);
    if (index < 0) {
        return { index: -1, rotation: currentRotation, jitter: 0 };
    }
    const jitter = (rng() - 0.5) * segmentAngle(count) * 0.5;
    return {
        index,
        rotation: rotationForIndex(
            index,
            count,
            currentRotation,
            extraTurns,
            jitter,
        ),
        jitter,
    };
}

/**
 * Palette slot for a slice. Adjacent slices always differ, and when the
 * count makes the last slice collide with its two neighbours we shift it one
 * slot further.
 */
export function segmentPaletteIndex(index: number, count: number): number {
    const slot = index % WHEEL_PALETTE_SIZE;
    if (count <= 1 || index !== count - 1) return slot;
    const first = 0;
    const previous = (index - 1) % WHEEL_PALETTE_SIZE;
    if (slot !== first && slot !== previous) return slot;
    // Both neighbours claim this slot; take the first free one after it.
    for (let step = 1; step <= WHEEL_PALETTE_SIZE; step += 1) {
        const candidate = (slot + step) % WHEEL_PALETTE_SIZE;
        if (candidate !== first && candidate !== previous) return candidate;
    }
    return slot;
}

/** How large the winner's name may render in the fixed-height result card. */
export type DinnerResultNameSize = "long" | "medium" | "short";

/**
 * Pick a result-name size by code-point length. The result card keeps a fixed
 * height (so the page never jumps), and a name is allowed at most two lines:
 * shrinking long names keeps even the 24-character maximum inside its slot.
 */
export function resultNameSize(name: string): DinnerResultNameSize {
    const length = Array.from(name).length;
    if (length > 16) return "long";
    if (length > 8) return "medium";
    return "short";
}

/** Short label drawn on a slice; the management list keeps the full name. */
export function wheelLabel(name: string, max = 6): string {
    const chars = Array.from(name);
    return chars.length > max ? `${chars.slice(0, max).join("")}…` : name;
}

/** Labels shrink as the wheel gets busier, so 28 options still fit. */
export function wheelLabelFontSize(count: number): number {
    if (count > 20) return 8.5;
    if (count > 14) return 9.5;
    if (count > 8) return 10.5;
    return 12;
}

/**
 * Above this many slices, printing every name turns the rim into a solid ring
 * of overlapping text. The wheel keeps a subset of labels and the result card
 * carries the full chosen name.
 */
export const WHEEL_LABEL_LIMIT = 16;

/** Roughly how many labels to leave on a crowded wheel. */
export const WHEEL_LABEL_TARGET = 10;

/** Every Nth slice gets a label; 1 means every slice. */
export function wheelLabelStride(count: number): number {
    if (count <= WHEEL_LABEL_LIMIT) return 1;
    return Math.max(2, Math.ceil(count / WHEEL_LABEL_TARGET));
}

/** Whether slice `index` should draw its name on a `count`-slice wheel. */
export function shouldDrawWheelLabel(index: number, count: number): boolean {
    if (index < 0 || index >= count) return false;
    return index % wheelLabelStride(count) === 0;
}

/** Total turns for a spin — five or six, randomly. */
export function spinTurns(rng: () => number = Math.random): number {
    return 5 + Math.floor(rng() * 2);
}
