import { describe, expect, test } from "bun:test";

import { type DevAccount, findDevAccount } from "./dev-accounts";

const accounts: DevAccount[] = [
    { key: "test", email: "test@mimi.local", password: "a", name: "A" },
    { key: "test2", email: "test2@mimi.local", password: "b", name: "B" },
];

describe("findDevAccount", () => {
    test("matches a key, ignoring case and surrounding spaces", () => {
        expect(findDevAccount("test2", accounts)?.email).toBe(
            "test2@mimi.local",
        );
        expect(findDevAccount("  TEST ", accounts)?.email).toBe(
            "test@mimi.local",
        );
    });

    test("returns null for missing or unknown keys", () => {
        expect(findDevAccount(null, accounts)).toBeNull();
        expect(findDevAccount("", accounts)).toBeNull();
        expect(findDevAccount("   ", accounts)).toBeNull();
        expect(findDevAccount("admin", accounts)).toBeNull();
    });
});
