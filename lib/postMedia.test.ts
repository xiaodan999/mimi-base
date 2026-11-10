import { describe, expect, test } from "bun:test";

import {
    compressedVideoFileName,
    DEFAULT_VIDEO_RATIO,
    fileNames,
    formatFileSize,
    formatVideoDuration,
    VIDEO_MAX_BYTES,
    videoDisplayRatio,
    videoExtension,
    videoFileError,
    videoFirstFrameUrl,
} from "./postMedia";

const MB = 1024 * 1024;

describe("fileNames", () => {
    test("wraps the string PocketBase returns for maxSelect: 1", () => {
        expect(fileNames("clip_ab12.mp4")).toEqual(["clip_ab12.mp4"]);
    });

    test("keeps multi-file arrays and drops empty entries", () => {
        expect(fileNames(["a.jpg", "", "b.jpg"])).toEqual(["a.jpg", "b.jpg"]);
    });

    test("normalizes missing values", () => {
        expect(fileNames(undefined)).toEqual([]);
        expect(fileNames(null)).toEqual([]);
        expect(fileNames("")).toEqual([]);
        expect(fileNames([])).toEqual([]);
    });
});

describe("videoExtension", () => {
    test("returns the lowercase extension", () => {
        expect(videoExtension("clip.MP4")).toBe("mp4");
        expect(videoExtension("a.b/capture.webm")).toBe("webm");
        expect(videoExtension("IMG_0001.MOV")).toBe("mov");
    });

    test("returns an empty string without an extension", () => {
        expect(videoExtension("clip")).toBe("");
        expect(videoExtension("trailing.")).toBe("");
    });
});

describe("videoFileError", () => {
    test("accepts the three supported containers", () => {
        expect(
            videoFileError({ name: "a.mp4", type: "video/mp4", size: MB }),
        ).toBeNull();
        expect(
            videoFileError({ name: "a.webm", type: "video/webm", size: MB }),
        ).toBeNull();
        expect(
            videoFileError({
                name: "a.mov",
                type: "video/quicktime",
                size: MB,
            }),
        ).toBeNull();
    });

    test("falls back to the extension when the MIME type is empty", () => {
        expect(
            videoFileError({ name: "clip.MP4", type: "", size: MB }),
        ).toBeNull();
        expect(videoFileError({ name: "clip.MOV", size: MB })).toBeNull();
    });

    test("rejects images, unknown types and unknown extensions", () => {
        expect(
            videoFileError({ name: "a.png", type: "image/png", size: MB }),
        ).toBe("只支持 MP4、WebM 或 MOV 视频");
        expect(
            videoFileError({
                name: "a.mkv",
                type: "video/x-matroska",
                size: MB,
            }),
        ).toBe("只支持 MP4、WebM 或 MOV 视频");
        expect(videoFileError({ name: "a.mkv", size: MB })).toBe(
            "只支持 MP4、WebM 或 MOV 视频",
        );
    });

    test("rejects empty files", () => {
        expect(
            videoFileError({ name: "a.mp4", type: "video/mp4", size: 0 }),
        ).toBe("这个视频是空的，换一个试试");
    });

    test("rejects files above the 50MB cap and names the size", () => {
        expect(
            videoFileError({
                name: "a.mp4",
                type: "video/mp4",
                size: VIDEO_MAX_BYTES + 1,
            }),
        ).toBe("视频不能超过 50MB，这个有 50 MB");
        expect(
            videoFileError({
                name: "a.mp4",
                type: "video/mp4",
                size: 80 * MB,
            }),
        ).toBe("视频不能超过 50MB，这个有 80 MB");
    });

    test("rejects a file without a name", () => {
        expect(
            videoFileError({ name: "  ", type: "video/mp4", size: MB }),
        ).toBe("请选择一个视频文件");
    });
});

describe("formatFileSize", () => {
    test("uses B / KB / MB with one decimal below ten", () => {
        expect(formatFileSize(0)).toBe("0 B");
        expect(formatFileSize(512)).toBe("512 B");
        expect(formatFileSize(1536)).toBe("1.5 KB");
        expect(formatFileSize(900 * 1024)).toBe("900 KB");
        expect(formatFileSize(2.5 * MB)).toBe("2.5 MB");
        expect(formatFileSize(50 * MB)).toBe("50 MB");
    });
});

describe("compressedVideoFileName", () => {
    test("keeps the stem and switches to mp4", () => {
        expect(compressedVideoFileName("clip.MOV")).toBe("clip.mp4");
        expect(compressedVideoFileName("a.b.webm")).toBe("a.b.mp4");
    });

    test("falls back when the name has no stem", () => {
        expect(compressedVideoFileName(".mp4")).toBe("video.mp4");
        expect(compressedVideoFileName("   ")).toBe("video.mp4");
    });
});

describe("videoFirstFrameUrl", () => {
    test("appends a media fragment after the protected token", () => {
        expect(
            videoFirstFrameUrl(
                "http://127.0.0.1:8090/api/files/posts/abc/clip_1.mp4?token=xyz",
            ),
        ).toBe(
            "http://127.0.0.1:8090/api/files/posts/abc/clip_1.mp4?token=xyz#t=0.1",
        );
    });

    test("keeps an existing fragment", () => {
        expect(videoFirstFrameUrl("https://x.test/a.mp4#t=2")).toBe(
            "https://x.test/a.mp4#t=2",
        );
    });

    test("returns an empty string for an empty URL", () => {
        expect(videoFirstFrameUrl("")).toBe("");
    });
});

describe("videoDisplayRatio", () => {
    test("follows the intrinsic ratio of landscape and portrait clips", () => {
        expect(videoDisplayRatio(640, 360)).toBeCloseTo(16 / 9, 5);
        expect(videoDisplayRatio(360, 640)).toBeCloseTo(9 / 16, 5);
        expect(videoDisplayRatio(1080, 1080)).toBe(1);
    });

    test("keeps tall phone recordings, clamps only extremes", () => {
        // x.com shows a 590x1280 screen recording at its native 0.46 ratio.
        expect(videoDisplayRatio(590, 1280)).toBeCloseTo(590 / 1280, 5);
        expect(videoDisplayRatio(1080, 3600)).toBeCloseTo(2 / 5, 5);
        expect(videoDisplayRatio(2560, 1080)).toBeCloseTo(16 / 9, 5);
    });

    test("falls back to 16:9 before metadata is known", () => {
        expect(DEFAULT_VIDEO_RATIO).toBeCloseTo(16 / 9, 5);
        expect(videoDisplayRatio(0, 0)).toBe(DEFAULT_VIDEO_RATIO);
        expect(videoDisplayRatio(Number.NaN, 640)).toBe(DEFAULT_VIDEO_RATIO);
        expect(videoDisplayRatio(360, Number.POSITIVE_INFINITY)).toBe(
            DEFAULT_VIDEO_RATIO,
        );
    });
});

describe("formatVideoDuration", () => {
    test("uses m:ss below an hour", () => {
        expect(formatVideoDuration(0.4)).toBe("0:00");
        expect(formatVideoDuration(5)).toBe("0:05");
        expect(formatVideoDuration(59.6)).toBe("1:00");
        expect(formatVideoDuration(75)).toBe("1:15");
        expect(formatVideoDuration(600)).toBe("10:00");
    });

    test("uses h:mm:ss at an hour and beyond", () => {
        expect(formatVideoDuration(3600)).toBe("1:00:00");
        expect(formatVideoDuration(3725)).toBe("1:02:05");
    });

    test("returns an empty badge for unknown or streamed durations", () => {
        expect(formatVideoDuration(0)).toBe("");
        expect(formatVideoDuration(-1)).toBe("");
        expect(formatVideoDuration(Number.NaN)).toBe("");
        expect(formatVideoDuration(Number.POSITIVE_INFINITY)).toBe("");
    });
});
