import { describe, expect, test } from "bun:test";

import {
    BUILTIN_EXPENSE_CATEGORIES,
    categoryFromRecord,
    getExpenseCategory,
    guessCategoryIcon,
    mergeExpenseCategories,
    normalizeCategoryValue,
} from "./-categories";

const pet = categoryFromRecord({ id: "recPet", name: "宠物", icon: "paw" });

describe("getExpenseCategory", () => {
    test("keeps the built-in categories", () => {
        expect(BUILTIN_EXPENSE_CATEGORIES).toHaveLength(7);
        expect(getExpenseCategory("food").label).toBe("吃饭");
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
    });

    test("falls back to tag", () => {
        expect(guessCategoryIcon("杂项")).toBe("tag");
    });
});
