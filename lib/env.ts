// env.ts
import { z } from "zod";

// Define the schema as an object with all of the env
// variables and their types
const envSchema = z.object({
    POCKETBASE_URL: z.string().url(),
    ENV: z
        .union([
            z.literal("development"),
            z.literal("testing"),
            z.literal("production"),
        ])
        .default("development"),
    // ...
});

// Validate `import.meta.env` against our schema
// and return the result
const ENV = envSchema.parse({
    POCKETBASE_URL: import.meta.env.VITE_POCKETBASE_URL,
    ENV: import.meta.env.NODE_ENV,
});

// Export the result so we can use it in the project
export default ENV;
