import { describe, expect, test } from "bun:test";

import {
    canSeeFeedbackReport,
    isFeatureSuggestion,
    selectFeatureSuggestions,
    selectOwnBugReports,
} from "./filters";

const bugA = { owner: "account-a", kind: "bug" };
const bugB = { owner: "account-b", kind: "bug" };
const featureA = { owner: "account-a", kind: "feature" };
const featureB = { owner: "account-b", kind: "feature" };

describe("feedback visibility", () => {
    test("only feature suggestions are shared", () => {
        expect(isFeatureSuggestion(featureA)).toBe(true);
        expect(isFeatureSuggestion(bugA)).toBe(false);
    });

    test("mirrors the collection rule for each viewer", () => {
        // Account B may read its own bug plus both suggestions, never A's bug.
        expect(canSeeFeedbackReport(bugB, "account-b")).toBe(true);
        expect(canSeeFeedbackReport(featureA, "account-b")).toBe(true);
        expect(canSeeFeedbackReport(featureB, "account-b")).toBe(true);
        expect(canSeeFeedbackReport(bugA, "account-b")).toBe(false);
    });

    test("selects every suggestion for 大家的建议", () => {
        expect(
            selectFeatureSuggestions([bugA, featureA, bugB, featureB]),
        ).toEqual([featureA, featureB]);
    });

    test("keeps 我的反馈 owner-only and bug-only", () => {
        expect(
            selectOwnBugReports([bugA, featureA, bugB, featureB], "account-a"),
        ).toEqual([bugA]);
        expect(
            selectOwnBugReports([bugA, featureA, bugB, featureB], "account-b"),
        ).toEqual([bugB]);
    });
});
