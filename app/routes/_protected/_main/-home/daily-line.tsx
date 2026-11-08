import type { HomeStats } from "../-home-data";
import { buildDailyLine } from "./daily-line-text";

const FALLBACK = "今天也来记录一点什么吧。";

/**
 * The greeting line under the name. Computed locally from today's counts, so
 * opening Home never spends an AI request or shows a generation task.
 */
export default function DailyLine({
    stats,
    streak,
}: {
    stats: HomeStats | undefined;
    streak: number;
}) {
    return (
        <p className="mt-3 text-sm text-muted-foreground">
            {stats ? buildDailyLine({ ...stats, streak }) : FALLBACK}
        </p>
    );
}
