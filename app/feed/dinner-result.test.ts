import { describe, expect, test } from "bun:test";

import { parseDinnerResult } from "./dinner-result";

describe("parseDinnerResult", () => {
    test("reads the dish name after the marker", () => {
        expect(parseDinnerResult("[晚餐抽奖机]: 兰州拉面")).toEqual({
            name: "兰州拉面",
        });
        expect(parseDinnerResult("[晚餐抽奖机]:酸辣粉")).toEqual({
            name: "酸辣粉",
        });
    });

    test("keeps inner spaces and accepts a 24-character name", () => {
        expect(parseDinnerResult("[晚餐抽奖机]: 兰州 拉面")).toEqual({
            name: "兰州 拉面",
        });
        const longName = "外婆秘制红烧牛肉面配溏心蛋和手工鲜虾大馄饨加大排";
        expect(Array.from(longName)).toHaveLength(24);
        expect(parseDinnerResult(`[晚餐抽奖机]: ${longName}`)).toEqual({
            name: longName,
        });
    });

    test("trims whitespace around the whole post and the name", () => {
        expect(parseDinnerResult("  \n[晚餐抽奖机]:   酸辣粉  \n ")).toEqual({
            name: "酸辣粉",
        });
    });

    test("rejects an empty name", () => {
        expect(parseDinnerResult("[晚餐抽奖机]:")).toBeNull();
        expect(parseDinnerResult("[晚餐抽奖机]:    ")).toBeNull();
    });

    test("ignores ordinary post text", () => {
        expect(parseDinnerResult("普通动态，不应该变成晚餐卡")).toBeNull();
        expect(parseDinnerResult("")).toBeNull();
        expect(parseDinnerResult("[晚餐抽奖机] 兰州拉面")).toBeNull();
        expect(parseDinnerResult("今天吃 [晚餐抽奖机]: 兰州拉面")).toBeNull();
    });

    test("falls back for an edited post with an extra line", () => {
        expect(
            parseDinnerResult("[晚餐抽奖机]: 兰州拉面\n再加一份炸串"),
        ).toBeNull();
        expect(parseDinnerResult("[晚餐抽奖机]:\n兰州拉面")).toBeNull();
        expect(
            parseDinnerResult("[晚餐抽奖机]: 兰州拉面\r\n再加一份炸串"),
        ).toBeNull();
    });
});
