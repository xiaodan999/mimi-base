import { useQuery } from "@tanstack/react-query";
import { startOfDay, startOfMonth } from "date-fns/esm";

import { useCurrentUser } from "@/lib/auth";
import pb, { pbDate } from "@/lib/pb";
import { qk } from "@/lib/query-keys";

export type HomeStats = {
    postsToday: number;
    monthSpend: number;
    monthEntries: number;
};

type ExpenseRecord = {
    price: number;
};

/**
 * Small aggregate query for the home dashboard. Kept separate from the feed
 * and expense pages so Home can show totals without loading either list.
 */
export function useHomeStats() {
    const user = useCurrentUser();
    const now = new Date();
    const day = startOfDay(now);
    const month = startOfMonth(now);

    return useQuery({
        queryKey: qk.homeStats.get(user.id, day.toISOString()),
        queryFn: async (): Promise<HomeStats> => {
            const [posts, expenses] = await Promise.all([
                pb.collection("posts").getList(1, 1, {
                    filter: pb.filter("created >= {:from}", {
                        from: pbDate(day),
                    }),
                }),
                pb.collection("ji_zhang_biao").getFullList<ExpenseRecord>({
                    filter: pb.filter("created >= {:from}", {
                        from: pbDate(month),
                    }),
                }),
            ]);

            return {
                postsToday: posts.totalItems,
                monthSpend: expenses.reduce(
                    (sum, item) => sum + (item.price ?? 0),
                    0,
                ),
                monthEntries: expenses.length,
            };
        },
        staleTime: 60_000,
    });
}
