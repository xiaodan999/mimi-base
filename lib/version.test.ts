import { describe, expect, test } from "bun:test";

import { formatBuildTime, isDevBuild, sameBuild, shortSha } from "./version";

describe("isDevBuild", () => {
    test("treats a missing or dev sha as a dev build", () => {
        expect(isDevBuild("")).toBe(true);
        expect(isDevBuild("dev")).toBe(true);
    });

    test("accepts a real commit sha", () => {
        expect(isDevBuild("2b6f36c1a2b3")).toBe(false);
    });
});

describe("shortSha", () => {
    test("shortens a real sha to seven characters", () => {
        expect(shortSha("2b6f36c1a2b3")).toBe("2b6f36c");
    });

    test("labels a dev build", () => {
        expect(shortSha("dev")).toBe("开发版");
    });
});

describe("sameBuild", () => {
    test("matches the same sha case-insensitively", () => {
        expect(
            sameBuild({ sha: "2B6F36C1A2B3" }, { sha: "2b6f36c1a2b3" }),
        ).toBe(true);
    });

    test("detects a different deploy", () => {
        expect(
            sameBuild({ sha: "2b6f36c1a2b3" }, { sha: "aaaaaaaaaaaa" }),
        ).toBe(false);
    });

    test("never reports an update for a dev build", () => {
        expect(sameBuild({ sha: "dev" }, { sha: "2b6f36c1a2b3" })).toBe(true);
        expect(sameBuild({ sha: "2b6f36c1a2b3" }, { sha: "dev" })).toBe(true);
    });
});

describe("formatBuildTime", () => {
    test("formats an ISO timestamp as local time", () => {
        const date = new Date(2026, 10, 6, 9, 5);
        expect(formatBuildTime(date.toISOString())).toBe("2026-11-06 09:05");
    });

    test("keeps an unparseable value", () => {
        expect(formatBuildTime("not-a-date")).toBe("not-a-date");
    });
});
