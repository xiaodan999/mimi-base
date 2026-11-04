import { useQuery } from "@tanstack/react-query";

import { getExpenseCategory } from "@/app/routes/_protected/_main/jizhang/-categories";
import { streakDays } from "@/app/study/engine";
import { SUBJECTS } from "@/app/study/registry";
import { useCurrentUser } from "@/lib/auth";
import pb, { pbDate } from "@/lib/pb";
import { qk } from "@/lib/query-keys";

export type TopPost = {
    id: string;
    text: string;
    createdAt: string;
    likes: number;
    image: string;
    collectionId: string;
    collectionName: string;
};

export type YearReport = {
    year: number;
    posts: {
        total: number;
        photos: number;
        monthly: number[];
        top: TopPost[];
    };
    expenses: {
        total: number;
        count: number;
        monthly: number[];
        categories: { label: string; total: number; count: number }[];
        top: { name: string; price: number }[];
    };
    study: {
        xp: number;
        questions: number;
        correct: number;
        streak: number;
        subjects: { title: string; known: number; total: number }[];
    };
};

type PostRecord = {
    id: string;
    text: string;
    created: string;
    images?: string[];
    like_count?: number;
    collectionId: string;
    collectionName: string;
};

type ExpenseRecord = {
    item_name: string;
    price: number;
    created: string;
    category?: string;
};

export function useYearReport(year: number) {
    const user = useCurrentUser();

    return useQuery({
        queryKey: qk.yearReport(user.id, year),
        staleTime: 10 * 60_000,
        queryFn: async (): Promise<Omit<YearReport, "year" | "study">> => {
            const from = new Date(year, 0, 1);
            const to = new Date(year + 1, 0, 1);

            const [posts, expenses] = await Promise.all([
                pb.collection("posts").getFullList<PostRecord>({
                    filter: pb.filter("created >= {:from} && created < {:to}", {
                        from: pbDate(from),
                        to: pbDate(to),
                    }),
                    sort: "-created",
                }),
                pb.collection("ji_zhang_biao").getFullList<ExpenseRecord>({
                    filter: pb.filter("created >= {:from} && created < {:to}", {
                        from: pbDate(from),
                        to: pbDate(to),
                    }),
                    sort: "-created",
                }),
            ]);

            const postMonthly = Array.from({ length: 12 }, () => 0);
            let photos = 0;
            for (const post of posts) {
                const month = new Date(post.created).getMonth();
                postMonthly[month] += 1;
                photos += post.images?.length ?? 0;
            }

            const expenseMonthly = Array.from({ length: 12 }, () => 0);
            const categoryMap = new Map<
                string,
                { label: string; total: number; count: number }
            >();
            let expenseTotal = 0;
            for (const item of expenses) {
                const month = new Date(item.created).getMonth();
                expenseMonthly[month] += item.price;
                expenseTotal += item.price;

                const category = getExpenseCategory(item.category);
                const current = categoryMap.get(category.value) ?? {
                    label: category.label,
                    total: 0,
                    count: 0,
                };
                current.total += item.price;
                current.count += 1;
                categoryMap.set(category.value, current);
            }

            return {
                posts: {
                    total: posts.length,
                    photos,
                    monthly: postMonthly,
                    top: [...posts]
                        .sort(
                            (a, b) => (b.like_count ?? 0) - (a.like_count ?? 0),
                        )
                        .slice(0, 3)
                        .map((post) => ({
                            id: post.id,
                            text: post.text,
                            createdAt: post.created,
                            likes: post.like_count ?? 0,
                            image: post.images?.[0] ?? "",
                            collectionId: post.collectionId,
                            collectionName: post.collectionName,
                        })),
                },
                expenses: {
                    total: expenseTotal,
                    count: expenses.length,
                    monthly: expenseMonthly,
                    categories: [...categoryMap.values()].sort(
                        (a, b) => b.total - a.total,
                    ),
                    top: [...expenses]
                        .sort((a, b) => b.price - a.price)
                        .slice(0, 3)
                        .map((item) => ({
                            name: item.item_name,
                            price: item.price,
                        })),
                },
            };
        },
    });
}

/** Study progress is cumulative, so the report labels it as “截至目前”. */
export function buildStudyReport(
    summaries: Record<string, import("@/app/study/types").Progress> | undefined,
): YearReport["study"] {
    const values = Object.values(summaries ?? {});
    let questions = 0;
    let correct = 0;
    let xp = 0;
    let streak = 0;

    for (const progress of values) {
        xp += progress.xp ?? 0;
        streak = Math.max(streak, streakDays(progress));
        for (const stat of Object.values(progress.stat ?? {})) {
            questions += stat.r + stat.w;
            correct += stat.r;
        }
    }

    return {
        xp,
        questions,
        correct,
        streak,
        subjects: SUBJECTS.map((subject) => {
            const progress = summaries?.[subject.id];
            const known = subject.cards.filter(
                (card) => progress?.cards[card.id]?.k,
            ).length;
            return {
                title: subject.title,
                known,
                total: subject.cards.length,
            };
        }),
    };
}
