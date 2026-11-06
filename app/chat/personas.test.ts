import { describe, expect, test } from "bun:test";

import {
    BUILTIN_PERSONAS,
    DEFAULT_PERSONA_ID,
    findPersona,
    resolvePersona,
} from "./personas";
import type { ChatPersona } from "./types";

const custom: ChatPersona = {
    id: "persona-1",
    name: "自定义",
    icon: "🧪",
    description: "",
    prompt: "自定义设定",
    builtin: false,
};

describe("built-in personas", () => {
    test("includes an English-only teacher", () => {
        const teacher = BUILTIN_PERSONAS.find(
            (persona) => persona.id === "builtin:english-teacher",
        );
        expect(teacher?.name).toBe("英语老师");
        expect(teacher?.prompt).toContain("Reply in English only");
        expect(teacher?.builtin).toBe(true);
    });

    test("ids are unique", () => {
        const ids = BUILTIN_PERSONAS.map((persona) => persona.id);
        expect(new Set(ids).size).toBe(ids.length);
    });
});

describe("resolvePersona", () => {
    test("finds built-ins and custom personas", () => {
        expect(findPersona("builtin:english-teacher")?.name).toBe("英语老师");
        expect(findPersona(custom.id, [custom])?.name).toBe("自定义");
    });

    test("falls back to the default persona", () => {
        expect(resolvePersona("missing", [custom]).id).toBe(DEFAULT_PERSONA_ID);
        expect(resolvePersona(undefined, []).id).toBe(DEFAULT_PERSONA_ID);
    });
});
