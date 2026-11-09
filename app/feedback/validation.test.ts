import { describe, expect, test } from "bun:test";

import {
    MAX_ATTACHMENT_BYTES,
    MAX_FEEDBACK_ATTACHMENTS,
    MAX_FEEDBACK_DESCRIPTION,
    MAX_FEEDBACK_TITLE,
    validateFeedback,
} from "./validation";

const image = (name = "shot.webp", size = 1024) => ({
    name,
    size,
    type: "image/webp",
});

const textFile = (name = "log.txt", size = 1024) => ({
    name,
    size,
    type: "text/plain",
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

    test("accepts up to three mixed attachments", () => {
        expect(
            validateFeedback({
                title: "t",
                description: "d",
                attachments: [
                    image("a"),
                    textFile("b"),
                    { name: "c.zip", size: 2048, type: "application/zip" },
                ],
            }).ok,
        ).toBe(true);
    });

    test("accepts a file without a MIME type", () => {
        expect(
            validateFeedback({
                title: "t",
                description: "d",
                attachments: [{ name: "dump.bin", size: 10 }],
            }).ok,
        ).toBe(true);
    });

    test("rejects too many attachments", () => {
        const attachments = Array.from(
            { length: MAX_FEEDBACK_ATTACHMENTS + 1 },
            (_, index) => image(`shot-${index}.webp`),
        );
        expect(
            validateFeedback({
                title: "t",
                description: "d",
                attachments,
            }),
        ).toEqual({
            ok: false,
            error: `最多上传 ${MAX_FEEDBACK_ATTACHMENTS} 个附件`,
        });
    });

    test("rejects an oversized attachment", () => {
        expect(
            validateFeedback({
                title: "t",
                description: "d",
                attachments: [image("big.png", MAX_ATTACHMENT_BYTES + 1)],
            }),
        ).toEqual({ ok: false, error: "单个附件不能超过 10MB" });
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

    test("accepts a feature suggestion with attachments", () => {
        expect(
            validateFeedback({
                kind: "feature",
                title: " 想要每日一句 ",
                description: " 想要什么 / 为什么 / 怎么用 ",
                attachments: [image("a"), textFile("b")],
            }),
        ).toEqual({
            ok: true,
            title: "想要每日一句",
            description: "想要什么 / 为什么 / 怎么用",
        });
    });
});
