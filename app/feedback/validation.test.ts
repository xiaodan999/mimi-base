import { describe, expect, test } from "bun:test";

import {
    MAX_FEEDBACK_DESCRIPTION,
    MAX_FEEDBACK_SCREENSHOTS,
    MAX_FEEDBACK_TITLE,
    MAX_SCREENSHOT_BYTES,
    validateFeedback,
} from "./validation";

const image = (name = "shot.webp", size = 1024) => ({
    name,
    size,
    type: "image/webp",
});

describe("validateFeedback", () => {
    test("trims the title and description", () => {
        expect(
            validateFeedback({
                title: "  首页闪退 ",
                description: " 打开就白屏 ",
            }),
        ).toEqual({
            ok: true,
            title: "首页闪退",
            description: "打开就白屏",
        });
    });

    test("requires both fields", () => {
        expect(validateFeedback({ title: "  ", description: "x" })).toEqual({
            ok: false,
            error: "请填写一句话标题",
        });
        expect(validateFeedback({ title: "x", description: "  " })).toEqual({
            ok: false,
            error: "请描述一下遇到的问题",
        });
    });

    test("enforces title and description caps", () => {
        expect(
            validateFeedback({
                title: "x".repeat(MAX_FEEDBACK_TITLE + 1),
                description: "x",
            }).ok,
        ).toBe(false);
        expect(
            validateFeedback({
                title: "x",
                description: "x".repeat(MAX_FEEDBACK_DESCRIPTION + 1),
            }).ok,
        ).toBe(false);
        expect(
            validateFeedback({
                title: "x".repeat(MAX_FEEDBACK_TITLE),
                description: "x".repeat(MAX_FEEDBACK_DESCRIPTION),
            }).ok,
        ).toBe(true);
    });

    test("accepts up to three screenshots", () => {
        const result = validateFeedback({
            title: "t",
            description: "d",
            screenshots: [image("a"), image("b"), image("c")],
        });
        expect(result.ok).toBe(true);
    });

    test("rejects too many screenshots", () => {
        const screenshots = Array.from(
            { length: MAX_FEEDBACK_SCREENSHOTS + 1 },
            (_, index) => image(`shot-${index}.webp`),
        );
        expect(
            validateFeedback({
                title: "t",
                description: "d",
                screenshots,
            }),
        ).toEqual({
            ok: false,
            error: `最多上传 ${MAX_FEEDBACK_SCREENSHOTS} 张截图`,
        });
    });

    test("rejects non-images and oversized files", () => {
        expect(
            validateFeedback({
                title: "t",
                description: "d",
                screenshots: [{ name: "a.txt", size: 10, type: "text/plain" }],
            }),
        ).toEqual({ ok: false, error: "截图需要是图片文件" });
        expect(
            validateFeedback({
                title: "t",
                description: "d",
                screenshots: [image("big.png", MAX_SCREENSHOT_BYTES + 1)],
            }),
        ).toEqual({ ok: false, error: "单张截图不能超过 5MB" });
    });

    test("uses feature-suggestion copy for a missing description", () => {
        expect(
            validateFeedback({
                kind: "feature",
                title: "想要每日一句",
                description: "   ",
            }),
        ).toEqual({ ok: false, error: "请描述一下你的想法" });
    });

    test("uses photo wording for feature screenshots", () => {
        const tooMany = Array.from(
            { length: MAX_FEEDBACK_SCREENSHOTS + 1 },
            (_, index) => image(`photo-${index}.webp`),
        );
        expect(
            validateFeedback({
                kind: "feature",
                title: "t",
                description: "d",
                screenshots: tooMany,
            }),
        ).toEqual({
            ok: false,
            error: `最多上传 ${MAX_FEEDBACK_SCREENSHOTS} 张图片`,
        });
        expect(
            validateFeedback({
                kind: "feature",
                title: "t",
                description: "d",
                screenshots: [{ name: "a.txt", size: 10, type: "text/plain" }],
            }),
        ).toEqual({ ok: false, error: "照片需要是图片文件" });
    });

    test("accepts a feature suggestion with photos", () => {
        expect(
            validateFeedback({
                kind: "feature",
                title: " 想要每日一句 ",
                description: " 想要什么 / 为什么 / 怎么用 ",
                screenshots: [image("a"), image("b")],
            }),
        ).toEqual({
            ok: true,
            title: "想要每日一句",
            description: "想要什么 / 为什么 / 怎么用",
        });
    });
});
