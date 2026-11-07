/**
 * Tolerant parsing for streamed tool-call arguments.
 *
 * Fast models occasionally emit arguments that are not quite JSON: a raw
 * newline inside a long string, an invalid escape (`\d` in a regex, `\'`),
 * unescaped quotes around font names or CSS `content` values, a trailing
 * comma, or a tail cut off by the output limit. A strict `JSON.parse` turns
 * each of these into a failed tool call, so before giving up we repair the
 * classic malformations and try again. Pure functions so `bun test` can
 * cover the tricky parts.
 */

type ScanResult = {
    output: string;
    /** Input positions where a raw quote was taken as a string's close. */
    closes: number[];
};

/**
 * One repair scan. Every raw quote inside a string is either the close or
 * forgotten content; `forced` marks quotes that must be treated as content
 * (the backtracking below flips decisions there). Accepted closes are
 * recorded so a failed overall parse can retry with the earliest one
 * re-interpreted as content.
 */
function scanJson(
    text: string,
    forced: ReadonlySet<number>,
    closeTail: boolean,
): ScanResult {
    let out = "";
    let inString = false;
    const stack: string[] = [];
    const closers: Record<string, string> = { "{": "}", "[": "]" };
    const closes: number[] = [];

    const nextNonSpace = (start: number): [number, string] => {
        let j = start;
        while (j < text.length && /\s/.test(text[j]!)) j += 1;
        return [j, j < text.length ? text[j]! : ""];
    };

    const emitControlChar = (char: string): string => {
        switch (char) {
            case "\n":
                return "\\n";
            case "\r":
                return "\\r";
            case "\t":
                return "\\t";
            case "\b":
                return "\\b";
            case "\f":
                return "\\f";
            default:
                return `\\u${char.charCodeAt(0).toString(16).padStart(4, "0")}`;
        }
    };

    const emitEscape = (index: number): number => {
        // `index` points at a backslash inside a string. Returns the index
        // after the emitted escape.
        const next = text[index + 1] ?? "";
        if (next === "") return index + 1; // dangling backslash: drop it
        if (next < " ") {
            out += emitControlChar(next);
            return index + 2;
        }
        if (`"\\/bfnrt`.includes(next)) {
            out += text.slice(index, index + 2);
            return index + 2;
        }
        if (next === "u") {
            const hex = text.slice(index + 2, index + 6);
            if (/^[0-9a-fA-F]{4}$/.test(hex)) {
                out += text.slice(index, index + 6);
                return index + 6;
            }
        }
        if (next === "'") {
            out += "'"; // `\'` is not JSON; the model meant a plain quote
            return index + 2;
        }
        // Unknown escape (`\d`, `\x28`, ...): the model meant a literal
        // backslash + char (regex, CSS), so keep both — which in JSON text
        // means doubling the backslash.
        out += `\\\\${next}`;
        return index + 2;
    };

    /** Should the raw quote at `i` close the string, or is it content?
     * `close-certain` marks a key's colon (never wrong); `close` marks the
     * ambiguous cases worth backtracking over. */
    const classifyClose = (i: number): "close-certain" | "close" | "escape" => {
        if (forced.has(i)) return "escape";
        const [, after] = nextNonSpace(i + 1);
        if (after === ":") return "close-certain";
        // End of input or the enclosing bracket: probably the close, but
        // CSS like `content:"◆" }` ends a value the same way — backtrackable.
        if (after === "" || after === "}" || after === "]") return "close";
        if (after !== ",") return "escape";
        // After a comma the grammar wants a key (object) or a value (array).
        const container = stack[stack.length - 1];
        const [k, first] = nextNonSpace(i + 2);
        if (container === "[") {
            // Another element may follow: any value start.
            return first !== "" && `"-0123456789{[tfn`.includes(first)
                ? "close"
                : "escape";
        }
        if (first === "}") return "close"; // trailing comma
        if (first !== '"') return "escape";
        // An object may only be followed by `"key":` — check that shape.
        let m = k + 1;
        while (m < text.length && text[m] !== '"') m += 1;
        if (m >= text.length) return "escape";
        const [, colon] = nextNonSpace(m + 1);
        return colon === ":" ? "close" : "escape";
    };

    let i = 0;
    while (i < text.length) {
        const char = text[i]!;
        if (!inString) {
            if (char === '"') {
                inString = true;
                out += char;
            } else if (char === "{" || char === "[") {
                stack.push(char);
                out += char;
            } else if (char === "}" || char === "]") {
                const top = stack[stack.length - 1];
                if (top && closers[top] === char) {
                    stack.pop();
                    out += char;
                }
                // A stray closing bracket is dropped.
            } else if (char === ",") {
                const [, following] = nextNonSpace(i + 1);
                if (following === "}" || following === "]") {
                    // Trailing comma before the closing bracket: drop it.
                } else {
                    out += char;
                }
            } else {
                out += char;
            }
            i += 1;
            continue;
        }

        if (char === "\\") {
            i = emitEscape(i);
            continue;
        }
        if (char === '"') {
            const verdict = classifyClose(i);
            if (verdict !== "escape") {
                inString = false;
                out += char;
                if (verdict === "close") closes.push(i);
            } else {
                out += '\\"';
            }
            i += 1;
            continue;
        }
        if (char < " ") {
            out += emitControlChar(char);
            i += 1;
            continue;
        }
        out += char;
        i += 1;
    }

    if (inString && !closeTail) return { output: "", closes: [] };
    if (inString) out += '"';
    while (closeTail && stack.length > 0) {
        out += closers[stack.pop()!]!;
    }
    return { output: out, closes };
}

function parseObject(text: string): Record<string, unknown> | null {
    try {
        const parsed = JSON.parse(text) as unknown;
        return typeof parsed === "object" &&
            parsed !== null &&
            !Array.isArray(parsed)
            ? (parsed as Record<string, unknown>)
            : null;
    } catch {
        return null;
    }
}

/** Greedy lookahead is not oracle: a content quote right before `,` or `}`
 * (CSS `content:"◆" }`) looks exactly like a real close. On a failed parse,
 * flip the earliest accepted close to "content" and re-scan; the flipped
 * region re-derives the rest. Bounded so hopeless garbage cannot spin. */
const MAX_REPAIR_ATTEMPTS = 40;

/**
 * Parse tool-call arguments into an object. Strict first; on failure, repair
 * scans (with backtracking over quote decisions) before returning null.
 */
export function parseToolArgs(
    argsText: string,
    options: { closeTail?: boolean } = {},
): Record<string, unknown> | null {
    const strict = parseObject(argsText);
    if (strict) return strict;
    const closeTail = options.closeTail ?? true;
    const forced = new Set<number>();
    for (let attempt = 0; attempt < MAX_REPAIR_ATTEMPTS; attempt++) {
        const { output, closes } = scanJson(argsText, forced, closeTail);
        const parsed = parseObject(output);
        if (parsed) return parsed;
        const target = closes.find((pos) => !forced.has(pos));
        if (target === undefined) return null;
        forced.add(target);
    }
    return null;
}
