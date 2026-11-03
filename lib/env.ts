// env.ts

// This module sits on the critical path for every page (main -> auth -> pb),
// so it must not pull in a validation library: zod lives in the route chunks
// that actually use it (login, jizhang) instead.
const POCKETBASE_URL = import.meta.env.VITE_POCKETBASE_URL;

if (typeof POCKETBASE_URL !== "string" || POCKETBASE_URL.length === 0) {
    throw new Error("VITE_POCKETBASE_URL is required");
}

try {
    new URL(POCKETBASE_URL);
} catch {
    throw new Error(
        `VITE_POCKETBASE_URL is not a valid URL: ${POCKETBASE_URL}`,
    );
}

const ENV = {
    POCKETBASE_URL,
    ENV: import.meta.env.NODE_ENV,
} as const;

// Export the result so we can use it in the project
export default ENV;
