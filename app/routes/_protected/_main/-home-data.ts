import { useQuery } from "@tanstack/react-query";
import { endOfDay, startOfDay, startOfMonth } from "date-fns/esm";

import { useCurrentUser } from "@/lib/auth";
import { getDateString } from "@/lib/date";
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
export type MemoryPost = {
    id: string;
    text: string;
    createdAt: string;
    image: string;
    /** Needed to build the protected file URL. */
    collectionId: string;
    collectionName: string;
    yearsAgo: number;
};

type MemoryRecord = {
    id: string;
    text: string;
    created: string;
    images?: string[];
    collectionId: string;
    collectionName: string;
};

const MEMORY_YEARS = 5;

/**
 * Posts from the same month/day in previous years. Querying each year
 * separately keeps this small, instead of downloading years of posts and
 * filtering on the client.
 */
export function useOnThisDay() {
    const user = useCurrentUser();
    const today = new Date();

    return useQuery({
        queryKey: qk.memories(user.id, getDateString(today)),
        staleTime: 30 * 60_000,
        queryFn: async (): Promise<MemoryPost[]> => {
            const years = Array.from(
                { length: MEMORY_YEARS },
                (_, index) => today.getFullYear() - index - 1,
            );

            const pages = await Promise.all(
                years.map(async (year) => {
                    const date = new Date(
                        year,
                        today.getMonth(),
                        today.getDate(),
                    );
                    // 2 月 29 日在平年不存在，跳过那一年。
                    if (date.getMonth() !== today.getMonth()) return [];

                    const result = await pb
                        .collection("posts")
                        .getList<MemoryRecord>(1, 4, {
                            filter: pb.filter(
                                "created >= {:from} && created <= {:to}",
                                {
                                    from: pbDate(startOfDay(date)),
                                    to: pbDate(endOfDay(date)),
                                },
                            ),
                            sort: "-created",
                        });

                    return result.items.map((record) => ({
                        id: record.id,
                        text: record.text,
                        createdAt: record.created,
                        image: record.images?.[0] ?? "",
                        collectionId: record.collectionId,
                        collectionName: record.collectionName,
                        yearsAgo: today.getFullYear() - year,
                    }));
                }),
            );

            return pages
                .flat()
                .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
                .slice(0, 4);
        },
    });
}

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
