import { describe, expect, test } from "bun:test";

import {
    DINNER_SEED,
    dinnerNameError,
    MAX_DINNER_NAME_LENGTH,
    normalizeAngle,
    normalizeDinnerName,
    randomIndex,
    resultNameSize,
    rotationForIndex,
    segmentCenterAngle,
    segmentPaletteIndex,
    shouldDrawWheelLabel,
    spinPlan,
    WHEEL_LABEL_LIMIT,
    WHEEL_LABEL_TARGET,
    wheelLabel,
    wheelLabelFontSize,
    wheelLabelStride,
} from "./options";

describe("dinner option validation", () => {
    test("normalizes surrounding and repeated whitespace", () => {
        expect(normalizeDinnerName("  火  锅 \n")).toBe("火 锅");
        expect(normalizeDinnerName("")).toBe("");
    });

    test("rejects empty and overlong names", () => {
        expect(dinnerNameError("   ", [])).toBe("先写一个想吃的吧");
        expect(
            dinnerNameError("好".repeat(MAX_DINNER_NAME_LENGTH + 1), []),
        ).toBe(`名字最多 ${MAX_DINNER_NAME_LENGTH} 个字`);
        expect(dinnerNameError("好".repeat(MAX_DINNER_NAME_LENGTH), [])).toBe(
            null,
        );
    });

    test("rejects duplicates ignoring case and whitespace", () => {
        const options = [{ id: "a", name: "KFC 炸鸡" }];
        expect(dinnerNameError("kfc  炸鸡", options)).toBe(
            "这个已经在转盘上了",
        );
        expect(dinnerNameError("kfc 炸鸡", options)).not.toBeNull();
    });

    test("allows a rename to keep its own current name", () => {
        const options = [{ id: "a", name: "火锅" }];
        expect(dinnerNameError("火 锅", options, "a")).toBeNull();
        expect(dinnerNameError("火锅", options, "b")).not.toBeNull();
    });

    test("seed list is non-empty and has no duplicate names", () => {
        expect(DINNER_SEED.length).toBeGreaterThan(2);
        const keys = DINNER_SEED.map((name) =>
            normalizeDinnerName(name).toLocaleLowerCase(),
        );
        expect(new Set(keys).size).toBe(keys.length);
    });
});

describe("wheel geometry", () => {
    test("slice centers start half a slice clockwise from the pointer", () => {
        expect(segmentCenterAngle(0, 4)).toBe(45);
        expect(segmentCenterAngle(1, 4)).toBe(135);
        expect(segmentCenterAngle(0, 28)).toBeCloseTo(360 / 56);
    });

    test("normalizes angles into [0, 360)", () => {
        expect(normalizeAngle(0)).toBe(0);
        expect(normalizeAngle(360)).toBe(0);
        expect(normalizeAngle(-90)).toBe(270);
        expect(normalizeAngle(-450)).toBe(270);
    });

    test("every slice can land under the pointer", () => {
        const count = 7;
        for (let index = 0; index < count; index += 1) {
            const rotation = rotationForIndex(index, count, 0);
            expect(
                normalizeAngle(rotation + segmentCenterAngle(index, count)),
            ).toBeCloseTo(0);
        }
    });

    test("rotation always moves forward by at least the extra turns", () => {
        const rotation = rotationForIndex(3, 7, 123.4, 5);
        expect(rotation).toBeGreaterThan(123.4 + 5 * 360);
        expect(rotation).toBeLessThan(123.4 + 6 * 360 + 1);
    });

    test("back-to-back spins accumulate instead of snapping backwards", () => {
        const first = rotationForIndex(2, 5, 0, 5);
        const second = rotationForIndex(0, 5, first, 5);
        expect(second).toBeGreaterThan(first);
        expect(normalizeAngle(second + segmentCenterAngle(0, 5))).toBeCloseTo(
            0,
        );
    });

    test("jitter stays within a quarter slice and keeps the chosen slice", () => {
        const count = 8;
        const jitter = segmentCenterAngle(0, count) * 0.2;
        const rotation = rotationForIndex(0, count, 0, 5, jitter);
        const landed = normalizeAngle(rotation + segmentCenterAngle(0, count));
        expect(Math.min(landed, 360 - landed)).toBeCloseTo(jitter);
        expect(Math.min(landed, 360 - landed)).toBeLessThan(360 / count / 2);
    });

    test("empty wheels do not rotate", () => {
        expect(rotationForIndex(0, 0, 42)).toBe(42);
        expect(spinPlan(0, 42).index).toBe(-1);
        expect(spinPlan(0, 42).rotation).toBe(42);
    });

    test("randomIndex stays inside the list and honors the rng", () => {
        expect(randomIndex(4, () => 0)).toBe(0);
        expect(randomIndex(4, () => 0.999999)).toBe(3);
        expect(randomIndex(4, () => 1)).toBe(3);
        expect(randomIndex(0)).toBe(-1);
    });

    test("spinPlan picks the slice its rotation points at", () => {
        const values = [0.72, 0.9];
        let call = 0;
        const plan = spinPlan(9, 100, () => values[call++ % values.length]);
        expect(plan.index).toBe(6);
        const landed = normalizeAngle(
            plan.rotation + segmentCenterAngle(plan.index, 9),
        );
        expect(Math.min(landed, 360 - landed)).toBeCloseTo(
            Math.abs(plan.jitter),
        );
    });
});

describe("wheel presentation", () => {
    test("adjacent slices never share a palette slot", () => {
        for (let count = 1; count <= 30; count += 1) {
            for (let index = 0; index < count; index += 1) {
                const slot = segmentPaletteIndex(index, count);
                expect(slot).toBeGreaterThanOrEqual(0);
                expect(slot).toBeLessThan(6);
                if (index > 0) {
                    expect(slot).not.toBe(
                        segmentPaletteIndex(index - 1, count),
                    );
                }
                if (count > 1 && index === count - 1) {
                    expect(slot).not.toBe(segmentPaletteIndex(0, count));
                }
            }
        }
    });

    test("labels truncate by code point and keep short names intact", () => {
        expect(wheelLabel("火锅")).toBe("火锅");
        expect(wheelLabel("李记一绝臭豆腐")).toBe("李记一绝臭豆…");
        expect(wheelLabel("abcdef", 3)).toBe("abc…");
    });

    test("labels shrink as the wheel fills up", () => {
        expect(wheelLabelFontSize(4)).toBeGreaterThan(wheelLabelFontSize(16));
        expect(wheelLabelFontSize(16)).toBeGreaterThan(wheelLabelFontSize(28));
    });

    test("result names shrink before they can outgrow the card", () => {
        expect(resultNameSize("火锅")).toBe("short");
        expect(resultNameSize("一二三四五六七八")).toBe("short");
        expect(resultNameSize("一二三四五六七八九")).toBe("medium");
        expect(resultNameSize("一二三四五六七八九十一二三四五六")).toBe(
            "medium",
        );
        expect(resultNameSize("一二三四五六七八九十一二三四五六七")).toBe(
            "long",
        );
        expect(resultNameSize("一二三四五六七八九十一二三四五六七八")).toBe(
            "long",
        );
    });

    test("small wheels keep every slice label", () => {
        for (let count = 1; count <= WHEEL_LABEL_LIMIT; count += 1) {
            expect(wheelLabelStride(count)).toBe(1);
            for (let index = 0; index < count; index += 1) {
                expect(shouldDrawWheelLabel(index, count)).toBe(true);
            }
        }
    });

    test("crowded wheels draw only every Nth label", () => {
        for (const count of [17, 28, 30, 31, 40, 60]) {
            const stride = wheelLabelStride(count);
            expect(stride).toBeGreaterThan(1);
            const drawn = Array.from({ length: count }, (_, index) =>
                shouldDrawWheelLabel(index, count),
            );
            const indexes = drawn
                .map((drawnHere, index) => (drawnHere ? index : -1))
                .filter((index) => index >= 0);
            expect(indexes.length).toBeLessThanOrEqual(
                Math.ceil(count / stride),
            );
            expect(indexes.length).toBeLessThanOrEqual(WHEEL_LABEL_TARGET + 1);
            for (let at = 1; at < indexes.length; at += 1) {
                expect(indexes[at] - indexes[at - 1]).toBe(stride);
            }
        }
    });

    test("label policy handles empty and out-of-range slices", () => {
        expect(shouldDrawWheelLabel(0, 0)).toBe(false);
        expect(shouldDrawWheelLabel(-1, 10)).toBe(false);
        expect(shouldDrawWheelLabel(10, 10)).toBe(false);
    });
});
