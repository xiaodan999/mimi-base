/**
 * Person chips for the data-tool result cards. Tool results persist people
 * as plain JSON (user id + display name + avatar filename); these helpers
 * turn that into a render-ready list — pure, so `bun test` covers them.
 * The avatar URL is built at render time (`getUserAvatarUrl`), never stored.
 */

export type ToolPerson = {
    id: string;
    name: string;
    avatar: string;
    /** Short suffix after the name, e.g. ¥total or a post count. */
    detail: string;
};

const MAX_PEOPLE = 6;

function personFrom(value: unknown, detail: string): ToolPerson | null {
    if (typeof value !== "object" || value === null) return null;
    const row = value as Record<string, unknown>;
    const name = typeof row.name === "string" ? row.name.trim() : "";
    if (name === "") return null;
    return {
        id: typeof row.id === "string" ? row.id : "",
        name,
        avatar: typeof row.avatar === "string" ? row.avatar : "",
        detail,
    };
}

/** people[] from get_expenses, already sorted by spend server-side. */
export function expensesPeople(result: unknown): ToolPerson[] {
    if (typeof result !== "object" || result === null) return [];
    const people = (result as { people?: unknown }).people;
    if (!Array.isArray(people)) return [];
    const out: ToolPerson[] = [];
    for (const value of people) {
        if (typeof value !== "object" || value === null) continue;
        const total = (value as { total?: unknown }).total;
        const amount = typeof total === "number" ? total : 0;
        const person = personFrom(value, `¥${formatMoney(amount)}`);
        if (person) out.push(person);
        if (out.length >= MAX_PEOPLE) break;
    }
    return out;
}

/** Distinct authors from search_posts items, most posts first. */
export function postAuthors(result: unknown): ToolPerson[] {
    if (typeof result !== "object" || result === null) return [];
    const items = (result as { items?: unknown }).items;
    if (!Array.isArray(items)) return [];
    const byId = new Map<string, ToolPerson & { count: number }>();
    for (const value of items) {
        if (typeof value !== "object" || value === null) continue;
        const row = value as Record<string, unknown>;
        const name = typeof row.by === "string" ? row.by.trim() : "";
        if (name === "") continue;
        // Fall back to the display name as the key when the id is missing
        // (older persisted results), so the chips still merge correctly.
        const id =
            typeof row.authorId === "string" && row.authorId !== ""
                ? row.authorId
                : name;
        const entry = byId.get(id) ?? {
            id,
            name,
            avatar: typeof row.avatar === "string" ? row.avatar : "",
            detail: "",
            count: 0,
        };
        entry.count += 1;
        byId.set(id, entry);
    }
    return [...byId.values()]
        .sort((a, b) => b.count - a.count)
        .slice(0, MAX_PEOPLE)
        .map(({ count, ...person }) => ({ ...person, detail: `${count} 条` }));
}

function formatMoney(value: number): string {
    return Number.isInteger(value) ? String(value) : value.toFixed(2);
}
