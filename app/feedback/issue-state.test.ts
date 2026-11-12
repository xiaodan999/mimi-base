import { describe, expect, test } from "bun:test";

import {
    parseFeedbackIssueStates,
    parseIssueNumber,
    parseRecordIssueState,
} from "./issue-state";

describe("parseIssueNumber", () => {
    test("accepts positive integers", () => {
        expect(parseIssueNumber(1)).toBe(1);
        expect(parseIssueNumber(91)).toBe(91);
    });

    test("drops zero, fractions and non-numbers", () => {
        expect(parseIssueNumber(0)).toBeUndefined();
        expect(parseIssueNumber(-3)).toBeUndefined();
        expect(parseIssueNumber(1.5)).toBeUndefined();
        expect(parseIssueNumber("91")).toBeUndefined();
        expect(parseIssueNumber(null)).toBeUndefined();
        expect(parseIssueNumber(undefined)).toBeUndefined();
    });
});

describe("parseRecordIssueState", () => {
    test("accepts the two persisted values", () => {
        expect(parseRecordIssueState("open")).toBe("open");
        expect(parseRecordIssueState("closed")).toBe("closed");
    });

    test("treats empty and unknown values as not known yet", () => {
        expect(parseRecordIssueState("")).toBeUndefined();
        expect(parseRecordIssueState(undefined)).toBeUndefined();
        expect(parseRecordIssueState(null)).toBeUndefined();
        expect(parseRecordIssueState("merged")).toBeUndefined();
        expect(parseRecordIssueState(1)).toBeUndefined();
    });
});

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
