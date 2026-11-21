import { describe, expect, test } from "bun:test";

import { createHostFetchBudget } from "./sandbox-budget";

describe("createHostFetchBudget", () => {
    test("caps concurrent host requests", () => {
        const budget = createHostFetchBudget({ maxActive: 2, maxTotal: 10 });
        const releaseA = budget.acquire();
        budget.acquire();
        expect(budget.active).toBe(2);

        expect(() => budget.acquire()).toThrow("同时最多 2 个联网请求");
        releaseA();
        expect(budget.active).toBe(1);
        expect(() => budget.acquire()).not.toThrow();
    });

    test("caps the total number of requests in one run", () => {
        const budget = createHostFetchBudget({ maxActive: 10, maxTotal: 2 });
        budget.acquire()();
        budget.acquire()();
        expect(budget.total).toBe(2);
        expect(() => budget.acquire()).toThrow("本轮最多联网 2 次");
    });

    test("releasing twice does not free a slot twice", () => {
        const budget = createHostFetchBudget({ maxActive: 1, maxTotal: 2 });
        const release = budget.acquire();
        release();
        release();
        expect(budget.active).toBe(0);
        // The released slot is reusable; the second release must not make
        // active negative or let two requests in.
        const next = budget.acquire();
        expect(budget.active).toBe(1);
        expect(() => budget.acquire()).toThrow();
        next();
    });
});
