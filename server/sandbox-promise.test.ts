import { describe, expect, test } from "bun:test";

import {
    newQuickJSAsyncWASMModule,
    type QuickJSAsyncContext,
    RELEASE_ASYNC,
} from "quickjs-emscripten";

import { hostPromise } from "./sandbox-promise";

/**
 * Drive a QuickJS async evaluation to completion. The worker uses the same
 * `executePendingJobs` loop to let a pending host promise resolve.
 */
async function evaluate(
    vm: QuickJSAsyncContext,
    code: string,
): Promise<unknown> {
    const evaluated = await vm.evalCodeAsync(code, "test.js");
    if (evaluated.error) {
        const message = vm.dump(evaluated.error);
        evaluated.error.dispose();
        throw new Error(String(message));
    }
    const settled = vm.resolvePromise(evaluated.value);
    const deadline = Date.now() + 5000;
    let done = false;
    while (!done && Date.now() < deadline) {
        const jobs = vm.runtime.executePendingJobs();
        if (jobs.alive) jobs.dispose();
        done = await Promise.race([
            settled.then(() => true),
            new Promise<boolean>((resolve) =>
                setTimeout(() => resolve(false), 20),
            ),
        ]);
    }
    evaluated.value.dispose();
    if (!done) throw new Error("timed out");
    const result = vm.getProp(vm.global, "result");
    const error = vm.getProp(vm.global, "hostError");
    const value = vm.dump(result);
    const failure = vm.dump(error);
    result.dispose();
    error.dispose();
    if (typeof failure === "string" && failure !== "") {
        throw new Error(failure);
    }
    return value;
}

/**
 * Each test owns one WASM module and lets the test process reclaim it. The
 * worker disposes per run, but disposing several asyncify modules in one Bun
 * process trips quickjs-emscripten 0.32's host-ref teardown.
 */
async function makeVm() {
    const module = await newQuickJSAsyncWASMModule(RELEASE_ASYNC);
    const runtime = module.newRuntime();
    runtime.setMemoryLimit(32 * 1024 * 1024);
    return runtime.newContext();
}

describe("hostPromise", () => {
    test("settles repeated and concurrent host calls", async () => {
        const vm = await makeVm();
        const fn = vm.newFunction("fetchText", () =>
            hostPromise(vm, async () => vm.newString("hello")),
        );
        vm.setProp(vm.global, "fetchText", fn);
        fn.dispose();

        const value = await evaluate(
            vm,
            `
            globalThis.result = undefined;
            globalThis.hostError = undefined;
            (async () => {
                const a = await fetchText();
                const b = await fetchText();
                const [c, d] = await Promise.all([fetchText(), fetchText()]);
                globalThis.result = [a, b, c, d];
            })().then(
                () => {},
                (error) => {
                    globalThis.hostError =
                        (error && (error.message || String(error))) ||
                        "failed";
                },
            );
            `,
        );

        expect(value).toEqual(["hello", "hello", "hello", "hello"]);
    });

    test("rejects every call instead of trapping the runtime", async () => {
        const vm = await makeVm();
        const fn = vm.newFunction("failText", () =>
            hostPromise(vm, async () => {
                throw new Error("boom");
            }),
        );
        vm.setProp(vm.global, "failText", fn);
        fn.dispose();

        const value = await evaluate(
            vm,
            `
            globalThis.result = undefined;
            globalThis.hostError = undefined;
            (async () => {
                const caught = [];
                for (let index = 0; index < 2; index += 1) {
                    try {
                        await failText();
                    } catch (error) {
                        caught.push(error && error.message);
                    }
                }
                globalThis.result = caught;
            })().then(
                () => {},
                (error) => {
                    globalThis.hostError =
                        (error && (error.message || String(error))) ||
                        "failed";
                },
            );
            `,
        );

        expect(value).toEqual(["boom", "boom"]);
    });
});
