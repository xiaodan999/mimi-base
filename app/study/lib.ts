/**
 * 学习基地里到处重复的纯小工具，集中到一处便于单测、避免各写各的。
 * 这个文件零依赖，games / components 都可以放心 import。
 */

/** 把 value 夹到 [min, max] 区间（原来在 3 个 scoring.ts 里各写了一份）。 */
export function clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
}

export type StarCount = 0 | 1 | 2 | 3;

/**
 * 3/2/1 星级阶梯（原来在 5 个计分函数里各写一遍 if/else 或三元）。
 * 从最优条件到最差条件依次判断，返回第一个命中的星数；都不命中给 0 星。
 *
 * 例：
 *   starLadder([
 *     { ok: perfect, stars: 3 },
 *     { ok: ratio >= 0.8, stars: 2 },
 *     { ok: ratio >= 0.5, stars: 1 },
 *   ]);
 */
export function starLadder(
    checks: ReadonlyArray<{ ok: boolean; stars: StarCount }>,
): StarCount {
    for (const check of checks) {
        if (check.ok) return check.stars;
    }
    return 0;
}

/** 通用星级显示：实心 ★ + 空心 ☆（原来在 SubjectHome 等处手写）。 */
export function starText(stars: number): string {
    const n = clamp(Math.round(stars), 0, 3);
    return "★".repeat(n) + "☆".repeat(3 - n);
}
