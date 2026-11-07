/**
 * Shiki syntax highlighting for chat code blocks. Everything is lazy: the
 * highlighter (plus its language/theme grammars) lives in its own chunk and
 * loads the first time a code block appears. The JavaScript regex engine
 * avoids the 600KB oniguruma wasm. Unsupported languages stay plain text.
 */

const LANGS = [
    "python",
    "javascript",
    "typescript",
    "tsx",
    "json",
    "bash",
    "html",
    "css",
    "sql",
    "markdown",
] as const;

type ShikiHighlighter = Awaited<ReturnType<typeof loadHighlighter>>;

let highlighterPromise: Promise<ShikiHighlighter> | null = null;

async function loadHighlighter() {
    const { createHighlighterCore } = await import("shiki/core");
    const { createJavaScriptRegexEngine } =
        await import("shiki/engine/javascript");
    return createHighlighterCore({
        themes: [
            import("@shikijs/themes/github-light"),
            import("@shikijs/themes/github-dark"),
        ],
        langs: [
            import("@shikijs/langs/python"),
            import("@shikijs/langs/javascript"),
            import("@shikijs/langs/typescript"),
            import("@shikijs/langs/tsx"),
            import("@shikijs/langs/json"),
            import("@shikijs/langs/bash"),
            import("@shikijs/langs/html"),
            import("@shikijs/langs/css"),
            import("@shikijs/langs/sql"),
            import("@shikijs/langs/markdown"),
        ],
        engine: createJavaScriptRegexEngine({ forgiving: true }),
    });
}

function getHighlighter(): Promise<ShikiHighlighter> {
    highlighterPromise ??= loadHighlighter().catch((error) => {
        // Don't cache startup failures: the next block retries.
        highlighterPromise = null;
        throw error;
    });
    return highlighterPromise;
}

export function isHighlightableLanguage(language: string): boolean {
    return (LANGS as readonly string[]).includes(language);
}

/** Highlight to HTML; returns null while loading or for unsupported langs. */
export async function highlightCode(
    code: string,
    language: string,
): Promise<string | null> {
    if (!isHighlightableLanguage(language)) return null;
    try {
        const highlighter = await getHighlighter();
        return highlighter.codeToHtml(code, {
            lang: language,
            themes: { light: "github-light", dark: "github-dark" },
            defaultColor: "light",
        });
    } catch {
        return null;
    }
}
