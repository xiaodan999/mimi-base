import { describe, expect, test } from "bun:test";

import { parseFeedbackIssueStates } from "./issue-state";

describe("parseFeedbackIssueStates", () => {
    test("keeps valid issue numbers and known states", () => {
        expect(
            parseFeedbackIssueStates({
                "7": "open",
                "12": "closed",
            }),
        ).toEqual({ 7: "open", 12: "closed" });
    });

    test("drops malformed keys and unknown states", () => {
        expect(
            parseFeedbackIssueStates({
                "0": "open",
                "-1": "open",
                "1.5": "open",
                nope: "open",
                "8": "merged",
                "9": null,
            }),
        ).toEqual({});
    });

    test("treats non-objects as empty", () => {
        expect(parseFeedbackIssueStates(null)).toEqual({});
        expect(parseFeedbackIssueStates("open")).toEqual({});
        expect(parseFeedbackIssueStates(["open"])).toEqual({});
    });
});
