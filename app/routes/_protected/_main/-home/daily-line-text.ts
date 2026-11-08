import { formatMoney } from "@/lib/money";

export type DailyLineFacts = {
    postsToday: number;
    monthSpend: number;
    monthEntries: number;
    streak: number;
};

/** 首页那行小结最多这么长，和原来 AI prompt 的限制一致。 */
const MAX_LENGTH = 34;

/** 什么记录都没有时，轻轻提醒一下。 */
const EMPTY_LINE = "今天还没记下什么，随手记一笔吧。";

/**
 * 首页问候语下面的今日小结：纯本地拼句，不请求模型。
 * 分句按「今天 → 本月 → 连续学习」排序；连续学习放不下就不提。
 */
export function buildDailyLine(facts: DailyLineFacts): string {
    if (
        facts.postsToday === 0 &&
        facts.monthEntries === 0 &&
        facts.streak === 0
    ) {
        return EMPTY_LINE;
    }

    const clauses = [
        facts.postsToday > 0
            ? `今天发了${facts.postsToday}条动态`
            : "今天还没发动态",
    ];

    if (facts.monthEntries > 0) {
        clauses.push(
            `本月花了${formatMoney(facts.monthSpend, true)}，共${facts.monthEntries}笔`,
        );
    }

    // 今天和本月是主体，不再裁剪；连续学习只是锦上添花，放不下就不提。
    let line = clauses.join("，");
    const streakClause = facts.streak > 0 ? `连续学习${facts.streak}天` : "";
    if (streakClause && `${line}，${streakClause}。`.length <= MAX_LENGTH) {
        line = `${line}，${streakClause}`;
    }

    return `${line}。`;
}
