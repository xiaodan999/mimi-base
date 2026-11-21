import type { ChatArtifactPart, SandboxFiles } from "@/app/chat/types";

export type ChatToolOutcome = {
    /** JSON-safe summary sent back to the model and stored on the part. */
    result: unknown;
    files: SandboxFiles;
    isError: boolean;
    /** Canonical arguments JSON; the raw model text may not parse. */
    argsText?: string;
    /** Artifact cards produced by this call; appended to the message. */
    artifacts?: ChatArtifactPart[];
    /**
     * Page images a `read_attachment` call rendered. Never put them in
     * `result` — the tool-result JSON would carry megabytes of base64 into
     * the model context. `prompt.ts` sends them as a synthetic user message.
     */
    resultImages?: string[];
};

export type ToolOutcome = Omit<ChatToolOutcome, "argsText">;
