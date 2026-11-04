import { describe, expect, test } from "bun:test";

import {
    BUILTIN_EXPENSE_CATEGORIES,
    categoryFromRecord,
    getExpenseCategory,
    guessCategoryIcon,
    mergeExpenseCategories,
    needsExpenseCategory,
    normalizeCategoryValue,
} from "./-categories";

const pet = categoryFromRecord({ id: "recPet", name: "宠物", icon: "paw" });

describe("getExpenseCategory", () => {
    test("keeps the built-in categories", () => {
        expect(BUILTIN_EXPENSE_CATEGORIES).toHaveLength(8);
        expect(getExpenseCategory("food").label).toBe("吃饭");
        expect(getExpenseCategory("takeout").label).toBe("外卖");
    });

    test("resolves custom categories by record id", () => {
        expect(getExpenseCategory("recPet", [pet]).label).toBe("宠物");
    });

    test("falls back to 其他 for empty, legacy, or deleted values", () => {
        expect(getExpenseCategory("").label).toBe("其他");
        expect(getExpenseCategory(undefined).label).toBe("其他");
        expect(getExpenseCategory("recGone", [pet]).label).toBe("其他");
    });
});

describe("normalizeCategoryValue", () => {
    const categories = mergeExpenseCategories([pet]);

    test("accepts the stored value", () => {
        expect(normalizeCategoryValue("food", categories)).toBe("food");
        expect(normalizeCategoryValue("recPet", categories)).toBe("recPet");
    });

    test("accepts the Chinese label the model sometimes returns", () => {
        expect(normalizeCategoryValue(" 宠物 ", categories)).toBe("recPet");
        expect(normalizeCategoryValue("吃饭", categories)).toBe("food");
    });

    test("returns an empty value when the model invents a category", () => {
        expect(normalizeCategoryValue("太空旅行", categories)).toBe("");
        expect(normalizeCategoryValue("", categories)).toBe("");
    });
});

describe("needsExpenseCategory", () => {
    const categories = mergeExpenseCategories([pet]);

    test("only never-categorized rows when 其他 is off", () => {
        expect(needsExpenseCategory("", false, categories)).toBe(true);
        expect(needsExpenseCategory("other", false, categories)).toBe(false);
        expect(needsExpenseCategory("recGone", false, categories)).toBe(false);
    });

    test("includes every row shown as 其他 when the toggle is on", () => {
        expect(needsExpenseCategory("", true, categories)).toBe(true);
        expect(needsExpenseCategory("other", true, categories)).toBe(true);
        // The list renders a deleted custom category as 其他, so backfill it.
        expect(needsExpenseCategory("recGone", true, categories)).toBe(true);
        expect(needsExpenseCategory(undefined, true, categories)).toBe(true);
    });

    test("keeps properly categorized rows out", () => {
        expect(needsExpenseCategory("food", true, categories)).toBe(false);
        expect(needsExpenseCategory("recPet", true, categories)).toBe(false);
    });
});

describe("categoryFromRecord", () => {
    test("uses the record id as the value and marks it custom", () => {
        expect(pet.value).toBe("recPet");
        expect(pet.label).toBe("宠物");
        expect(pet.custom).toBe(true);
    });

    test("falls back to the neutral tag tone for an unknown icon key", () => {
        const unknown = categoryFromRecord({
            id: "recX",
            name: "杂项",
            icon: "not-an-icon",
        });

        expect(unknown.tone).toBe("bg-muted text-muted-foreground");
    });

    test("falls back to 未命名 rather than an empty label", () => {
        expect(categoryFromRecord({ id: "recY", name: "  " }).label).toBe(
            "未命名",
        );
    });
});

describe("guessCategoryIcon", () => {
    test("matches common words in the category name", () => {
        expect(guessCategoryIcon("猫粮")).toBe("paw");
        expect(guessCategoryIcon("奶茶")).toBe("coffee");
        expect(guessCategoryIcon("健身卡")).toBe("dumbbell");
        expect(guessCategoryIcon("打车")).toBe("car");
        expect(guessCategoryIcon("美团外卖")).toBe("takeout");
    });

    test("falls back to tag", () => {
        expect(guessCategoryIcon("杂项")).toBe("tag");
    });
});
