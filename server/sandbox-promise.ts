import type { QuickJSAsyncContext, QuickJSHandle } from "quickjs-emscripten";

/**
 * Bridge a native host Promise to a QuickJS Promise without Emscripten
 * asyncify.
 *
 * `newAsyncifiedFunction` cannot be used for `sandbox.fetch` /
 * `sandbox.download`: the asyncify build in quickjs-emscripten 0.32.0 keeps
 * one unwind stack for the whole module, and a second *successful* call in the
 * same run traps inside the WASM (`free_zero_refcount` / "Out of bounds
 * memory access"). A rejected call does not, which is why the single-shot
 * tests missed it.
 *
 * Returning a QuickJS Promise instead keeps the host call synchronous. The
 * VM's `await` suspends on a normal pending promise, and the worker's
 * `executePendingJobs()` loop (which already runs while the top-level eval is
 * pending) propagates the result afterwards. This also allows concurrent
 * fetches (`Promise.all`), which asyncify never supported.
 *
 * The returned handle is duplicated by quickjs-emscripten's FFI on the way
 * back into the VM, so the deferred can be disposed once it settles.
 */
export function hostPromise(
    vm: QuickJSAsyncContext,
    task: () => Promise<QuickJSHandle>,
): QuickJSHandle {
    const deferred = vm.newPromise();

    void task().then(
        (handle) => {
            if (!deferred.alive) {
                handle.dispose();
                return;
            }
            deferred.resolve(handle);
            handle.dispose();
            deferred.dispose();
        },
        (error: unknown) => {
            if (!deferred.alive) return;
            const errorHandle = vm.newError(
                error instanceof Error ? error : new Error(String(error)),
            );
            deferred.reject(errorHandle);
            errorHandle.dispose();
            deferred.dispose();
        },
    );

    return deferred.handle;
}
