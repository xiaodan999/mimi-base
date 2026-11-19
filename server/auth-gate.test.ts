import { describe, expect, test } from "bun:test";

import { AuthBusyError, createAuthGate } from "./auth-gate";

describe("createAuthGate", () => {
    test("caps concurrent auth-refresh calls", async () => {
        const gate = createAuthGate(2);
        let release!: () => void;
        const blocked = new Promise<void>((resolve) => {
            release = resolve;
        });
        const task = () => blocked.then(() => "ok");

        const first = gate(task);
        const second = gate(task);
        await Promise.resolve();
        await expect(gate(task)).rejects.toBeInstanceOf(AuthBusyError);

        release();
        await Promise.all([first, second]);
        await expect(gate(async () => "next")).resolves.toBe("next");
    });

    test("releases the slot when the task throws", async () => {
        const gate = createAuthGate(1);
        await expect(
            gate(async () => {
                throw new Error("pb down");
            }),
        ).rejects.toThrow("pb down");
        await expect(gate(async () => "ok")).resolves.toBe("ok");
    });
});
