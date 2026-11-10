import { useState } from "react";

/** X's weighted character limit for a standard post. */
export const TWEET_TEXT_LIMIT = 280;

/** X counts every link as t.co's fixed 23 characters. */
const LINK_LENGTH = 23;
const LINK_AT = /https?:\/\/[^\s]+/uy;

/**
 * Characters X weights as two: CJK, Hangul, fullwidth forms and emoji. This
 * is the range table twitter-text uses, trimmed to the ranges people hit in
 * practice; anything else counts as one.
 */
function isWide(codePoint: number): boolean {
    return (
        (codePoint >= 0x1100 && codePoint <= 0x115f) ||
        (codePoint >= 0x2600 && codePoint <= 0x27bf) ||
        (codePoint >= 0x2e80 && codePoint <= 0x303e) ||
        (codePoint >= 0x3041 && codePoint <= 0x33ff) ||
        (codePoint >= 0x3400 && codePoint <= 0x4dbf) ||
        (codePoint >= 0x4e00 && codePoint <= 0x9fff) ||
        (codePoint >= 0xa000 && codePoint <= 0xa4cf) ||
        (codePoint >= 0xac00 && codePoint <= 0xd7a3) ||
        (codePoint >= 0xf900 && codePoint <= 0xfaff) ||
        (codePoint >= 0xfe30 && codePoint <= 0xfe4f) ||
        (codePoint >= 0xff00 && codePoint <= 0xff60) ||
        (codePoint >= 0xffe0 && codePoint <= 0xffe6) ||
        (codePoint >= 0x1f000 && codePoint <= 0x1faff) ||
        (codePoint >= 0x20000 && codePoint <= 0x3fffd)
    );
}

/**
 * The next unit of X's counter: a whole link counts 23, everything else is
 * one code point (two when wide). Returns the raw length too, so callers can
 * slice the original text at the same boundary.
 */
function nextToken(
    text: string,
    index: number,
): { length: number; weight: number } {
    LINK_AT.lastIndex = index;
    const link = LINK_AT.exec(text);
    if (link) {
        return { length: link[0].length, weight: LINK_LENGTH };
    }
    const codePoint = text.codePointAt(index) ?? 0;
    return {
        length: codePoint > 0xffff ? 2 : 1,
        weight: isWide(codePoint) ? 2 : 1,
    };
}

/** X's weighted length for a post, used for the Show more cutoff. */
export function tweetWeightedLength(text: string): number {
    let total = 0;
    for (let index = 0; index < text.length;) {
        const token = nextToken(text, index);
        total += token.weight;
        index += token.length;
    }
    return total;
}

/**
 * The preview X renders before 显示更多: the first 280 weighted characters,
 * backed up to the nearest word boundary within a short window so English
 * does not end mid-word. CJK has no spaces and hard-cuts. `null` means the
 * whole post fits and no button is needed.
 */
export function tweetPreview(text: string): string | null {
    if (tweetWeightedLength(text) <= TWEET_TEXT_LIMIT) return null;

    let total = 0;
    let cut = text.length;
    for (let index = 0; index < text.length;) {
        const token = nextToken(text, index);
        if (total + token.weight > TWEET_TEXT_LIMIT) {
            cut = index;
            break;
        }
        total += token.weight;
        index += token.length;
    }

    const windowStart = Math.max(0, cut - 24);
    for (let index = cut - 1; index >= windowStart; index -= 1) {
        if (/\s/u.test(text[index])) {
            cut = index;
            break;
        }
    }
    return text.slice(0, cut).trimEnd();
}

/**
 * Tweet body with X's fold: text longer than 280 weighted characters shows a
 * preview and 显示更多, which expands inline and then disappears (X has no
 * Show less in the timeline). All other layouts keep rendering full text.
 */
export function TweetText({ text }: { text: string }) {
    const [expanded, setExpanded] = useState(false);
    const preview = tweetPreview(text);

    return (
        <>
            <p className="mt-1.5 text-[15px] leading-relaxed break-words whitespace-pre-wrap">
                {preview === null || expanded ? text : preview}
            </p>
            {preview !== null && !expanded && (
                <button
                    type="button"
                    onClick={() => setExpanded(true)}
                    className="mt-1 block w-full text-left text-[15px] leading-relaxed text-primary active:opacity-70"
                >
                    显示更多
                </button>
            )}
        </>
    );
}
