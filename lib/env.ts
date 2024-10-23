// env.ts
import { z } from "zod";

// Define the schema as an object with all of the env
// variables and their types
const envSchema = z.object({
	SUPABASE_URL: z.string().url(),
	SUPABASE_PUBLISHABLE_KEY: z.string().min(1),
	ENV: z
		.union([
			z.literal("development"),
			z.literal("testing"),
			z.literal("production"),
		])
		.default("development"),
	// ...
});

// Validate `process.env` against our schema
// and return the result
const ENV = envSchema.parse({
	SUPABASE_URL: import.meta.env.VITE_SUPABASE_URL,
	SUPABASE_PUBLISHABLE_KEY: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
	ENV: import.meta.env.NODE_ENV,
});

// Export the result so we can use it in the project
export default ENV;
