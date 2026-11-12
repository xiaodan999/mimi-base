/**
 * The dinner wheel saves its result as a plain text post:
 * `[晚餐抽奖机]: 兰州拉面`. The marker is only a display hint on /home, so the
 * parser is deliberately strict: exactly one marker line and a non-empty
 * dish name. An edited post that grew a second line keeps rendering as normal
 * text instead of swallowing the extra copy into the dish name.
 */
const DINNER_RESULT_PREFIX = "[晚餐抽奖机]:";

export type DinnerResult = {
    /** The picked dish, trimmed; never empty. */
    name: string;
};

export function parseDinnerResult(text: string): DinnerResult | null {
    const trimmed = text.trim();
    if (!trimmed.startsWith(DINNER_RESULT_PREFIX)) return null;

    const rest = trimmed.slice(DINNER_RESULT_PREFIX.length);
    // Whitespace around the marker is trimmed, but a newline inside the body
    // is an extra line of post text, not part of a dish name.
    if (/[\r\n]/.test(rest)) return null;

    const name = rest.trim();
    return name ? { name } : null;
}
