import { describe, expect, test } from "bun:test";

import { NURSING_QC_META, SUBJECT_META } from "./meta";
import { GAMES } from "./games/registry";
import { HAZARDS, SCENE_LABELS } from "./games/ward/hazards";
import { SHIFT_EVENTS } from "./games/shift/events";
import { BANK } from "./subjects/nursing-qc/bank";
import { CARDS } from "./subjects/nursing-qc/cards";
import { STUDY_CONTENT_SCHEMA_VERSION, validateStudyContent } from "./validate";

/** 3D 场景对象 id 就是 SCENE_LABELS 的 key（与 WardScene 的 clickable() 对齐）。 */
const sceneObjectIds = Object.keys(SCENE_LABELS);

describe("validateStudyContent（真实内容交叉引用）", () => {
    const problems = validateStudyContent({
        cards: CARDS,
        bank: BANK,
        games: GAMES,
        hazards: [...HAZARDS, ...SHIFT_EVENTS],
        sceneObjectIds,
    });

    test("没有悬空引用", () => {
        expect(problems).toEqual([]);
    });

    test("schema 版本是正整数", () => {
        expect(STUDY_CONTENT_SCHEMA_VERSION).toBeGreaterThan(0);
    });
});

describe("validateStudyContent（故意塞坏数据能抓到）", () => {
    const base = {
        cards: [{ id: "c1" }, { id: "c2" }],
        bank: [{ id: "q1", card: "c1" }],
        games: [{ id: "g1", cards: ["c2"] }],
        hazards: [{ id: "h1", object: "rail-a" }],
        sceneObjectIds: ["rail-a"],
    };

    test("bank.card 指向不存在的卡", () => {
        expect(
            validateStudyContent({
                ...base,
                bank: [{ id: "q1", card: "nope" }],
            }),
        ).toEqual([{ kind: "bank.card", ref: "q1", target: "nope" }]);
    });

    test("GAMES.cards 指向不存在的卡", () => {
        expect(
            validateStudyContent({
                ...base,
                games: [{ id: "g1", cards: ["missing"] }],
            }),
        ).toEqual([{ kind: "game.cards", ref: "g1", target: "missing" }]);
    });

    test("hazard.object 指向不存在的 3D 对象", () => {
        expect(
            validateStudyContent({
                ...base,
                hazards: [{ id: "h1", object: "ghost" }],
            }),
        ).toEqual([{ kind: "hazard.object", ref: "h1", target: "ghost" }]);
    });

    test("没有 card 字段的题不参与检查", () => {
        expect(validateStudyContent({ ...base, bank: [{ id: "q1" }] })).toEqual(
            [],
        );
    });
});

describe("SUBJECT_META 数量与真实内容对齐", () => {
    test("cardCount / bankCount 与 CARDS / BANK 长度一致", () => {
        expect(NURSING_QC_META.cardCount).toBe(CARDS.length);
        expect(NURSING_QC_META.bankCount).toBe(BANK.length);
    });

    test("每个科目都有元数据", () => {
        expect(SUBJECT_META.length).toBeGreaterThan(0);
        expect(SUBJECT_META[0].id).toBe(NURSING_QC_META.id);
    });
});
