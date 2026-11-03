import { describe, expect, test } from "bun:test";

import { isChunkLoadError } from "./chunk-load-error";

describe("isChunkLoadError", () => {
    test("matches the browser message for a failed dynamic import", () => {
        const error = new TypeError(
            "Failed to fetch dynamically imported module: " +
                "https://xiudan.club/assets/WardHazardGame-D0S93AzF.js",
        );
        expect(isChunkLoadError(error)).toBe(true);
    });

    test("matches stale-deploy MIME failures and webpack chunks", () => {
        expect(
            isChunkLoadError(
                new Error(
                    "Failed to load module script: Expected a JavaScript " +
                        "module script but the server responded with a MIME " +
                        "type of 'text/html'.",
                ),
            ),
        ).toBe(true);
        expect(
            isChunkLoadError(
                new Error("ChunkLoadError: Loading chunk 12 failed"),
            ),
        ).toBe(true);
        expect(
            isChunkLoadError("error loading dynamically imported module"),
        ).toBe(true);
    });

    test("ignores unrelated errors", () => {
        expect(
            isChunkLoadError(new Error("Request failed with status 401")),
        ).toBe(false);
        expect(isChunkLoadError(undefined)).toBe(false);
        expect(isChunkLoadError({ message: "Failed to fetch" })).toBe(false);
    });
});
