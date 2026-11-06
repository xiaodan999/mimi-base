import { useCallback, useMemo } from "react";
import {
    keepPreviousData,
    queryOptions,
    useMutation,
    useQuery,
    useQueryClient,
    type QueryClient,
} from "@tanstack/react-query";
import { endOfDay, startOfDay, startOfMonth } from "date-fns/esm";
import { DateRange } from "react-day-picker";

import { useCurrentUser } from "@/lib/auth";
import { getDateString } from "@/lib/date";
import groupBy from "@/lib/groupBy";
import pb, { pbDate } from "@/lib/pb";
import {
    type JiZhangItemData,
    type JiZhangRecord,
    toJiZhangItemData,
} from "@/lib/pb-types";
import { qk } from "@/lib/query-keys";

import {
    BUILTIN_EXPENSE_CATEGORIES,
    categoryFromRecord,
    guessCategoryIcon,
    resolveExpenseCategory,
    type ExpenseCategory,
    type ExpenseCategoryRecord,
} from "./-categories";

// The view-model shape now lives in lib/pb-types.ts; keep re-exporting it so
// `-summary` and its tests importing from `./-data` don't need to change.
export type { JiZhangItemData } from "@/lib/pb-types";

export function useJiZhang(range: DateRange | undefined) {
    const user = useCurrentUser();
    return useQuery(jiZhangQueryOptions(user.id, range));
}

/** The range the page opens with: the current month up to today. */
export function defaultJiZhangRange(): DateRange {
    const now = new Date();
    return { from: startOfMonth(now), to: endOfDay(now) };
}

export function jiZhangQueryOptions(
    userId: string,
    range: DateRange | undefined,
) {
    const { from, to } = range ?? {};
    return queryOptions({
        queryKey: qk.jiZhang.list(userId, from, to),
        queryFn: async ({ signal }) => {
            if (range === undefined || from === undefined) return [];

            // single day when `to` is undefined, otherwise the full range
            const end = to ?? from;
            const rawData = await pb
                .collection("ji_zhang_biao")
                .getFullList<JiZhangRecord>({
                    filter: pb.filter(
                        "created >= {:from} && created <= {:to}",
                        {
                            from: pbDate(startOfDay(from)),
                            to: pbDate(endOfDay(end)),
                        },
                    ),
                    sort: "-created",
                    signal,
                });

            const transformedData: {
                date: string;
                items: JiZhangItemData[];
            }[] = [];

            groupBy(rawData.map(toJiZhangItemData), (item) =>
                getDateString(new Date(item.createdAt)),
            ).forEach((items, date) => {
                transformedData.push({ date, items });
            });

            return transformedData;
        },
        placeholderData: keepPreviousData,
    });
}

export function useAddJiZhang() {
    const user = useCurrentUser();
    const queryClient = useQueryClient();

    return useMutation({
        mutationKey: qk.mutations.addJiZhang(),
        mutationFn: async (
            newItem: Pick<JiZhangItemData, "itemName" | "price" | "category">,
        ) => {
            // PocketBase has no column default for user_id, send it.
            const record = await pb.collection("ji_zhang_biao").create({
                item_name: newItem.itemName,
                price: newItem.price,
                category: newItem.category,
                user_id: user.id,
            });
            return record.id;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: qk.jiZhang.all });
            queryClient.invalidateQueries({ queryKey: qk.homeStats.all });
        },
    });
}

export function useDeleteJiZhang() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationKey: qk.mutations.deleteJiZhang(),
        mutationFn: async (itemToDelete: Pick<JiZhangItemData, "id">) => {
            const deleted = await pb
                .collection("ji_zhang_biao")
                .delete(itemToDelete.id);
            if (!deleted) throw new Error("Failed to delete");
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: qk.jiZhang.all });
            queryClient.invalidateQueries({ queryKey: qk.homeStats.all });
        },
    });
}

export function useUpdateJiZhang() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationKey: qk.mutations.updateJiZhang(),
        mutationFn: async (patch: { id: string; category: string }) => {
            await pb
                .collection("ji_zhang_biao")
                .update(patch.id, { category: patch.category });
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: qk.jiZhang.all });
        },
    });
}

export function expenseCategoriesQueryOptions(userId: string) {
    return queryOptions({
        queryKey: qk.jiZhang.categories.of(userId),
        queryFn: async ({ signal }): Promise<ExpenseCategoryRecord[]> => {
            const records = await pb
                .collection("ji_zhang_category")
                .getFullList<ExpenseCategoryRecord>({
                    // update/delete are owner-scoped; only list my own rows.
                    filter: pb.filter("user_id = {:userId}", { userId }),
                    sort: "created",
                    signal,
                });
            return records;
        },
        staleTime: 5 * 60_000,
    });
}

/** Built-in categories plus the current user's own, newest last. */
export function useExpenseCategories() {
    const user = useCurrentUser();
    const query = useQuery(expenseCategoriesQueryOptions(user.id));

    const customCategories = useMemo(
        () => (query.data ?? []).map(categoryFromRecord),
        [query.data],
    );
    const categories = useMemo(
        () => [...BUILTIN_EXPENSE_CATEGORIES, ...customCategories],
        [customCategories],
    );
    const getCategory = useCallback(
        (value: string | null | undefined): ExpenseCategory =>
            resolveExpenseCategory(value, categories),
        [categories],
    );

    return {
        categories,
        customCategories,
        getCategory,
        isPending: query.isPending,
    };
}

/**
 * Built-in labels are uppercase-free and unique; the DB index only guards
 * custom-vs-custom, so check the merged list before writing.
 */
function assertCategoryNameAvailable(
    queryClient: QueryClient,
    userId: string,
    name: string,
    exceptId?: string,
) {
    const cached =
        queryClient.getQueryData<ExpenseCategoryRecord[]>(
            qk.jiZhang.categories.of(userId),
        ) ?? [];
    const taken = new Set([
        ...BUILTIN_EXPENSE_CATEGORIES.map((item) => item.label),
        ...cached
            .filter((item) => item.id !== exceptId)
            .map((item) => item.name),
    ]);
    if (taken.has(name)) throw new Error("已经有这个分类了");
}

export function useCreateExpenseCategory() {
    const user = useCurrentUser();
    const queryClient = useQueryClient();

    return useMutation({
        mutationKey: qk.mutations.createExpenseCategory(),
        mutationFn: async ({
            name,
            icon,
        }: {
            name: string;
            icon?: string;
        }): Promise<string> => {
            const trimmed = name.trim();
            assertCategoryNameAvailable(queryClient, user.id, trimmed);
            // PocketBase has no column default for user_id, send it.
            const record = await pb.collection("ji_zhang_category").create({
                name: trimmed,
                icon: icon ?? guessCategoryIcon(trimmed),
                user_id: user.id,
            });
            return record.id;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: qk.jiZhang.all });
        },
    });
}

export function useUpdateExpenseCategory() {
    const user = useCurrentUser();
    const queryClient = useQueryClient();

    return useMutation({
        mutationKey: qk.mutations.updateExpenseCategory(),
        mutationFn: async ({ id, name }: { id: string; name: string }) => {
            const trimmed = name.trim();
            assertCategoryNameAvailable(queryClient, user.id, trimmed, id);
            await pb
                .collection("ji_zhang_category")
                .update(id, { name: trimmed });
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: qk.jiZhang.all });
        },
    });
}

// One PATCH per row would be fine for a handful, but batch so deleting a
// category that is used by a long history stays responsive.
const CLEAR_BATCH_SIZE = 5;

/** Delete a custom category and clear it from the rows that used it. */
export function useDeleteExpenseCategory() {
    const user = useCurrentUser();
    const queryClient = useQueryClient();

    return useMutation({
        mutationKey: qk.mutations.deleteExpenseCategory(),
        mutationFn: async (id: string): Promise<number> => {
            const rows = await pb
                .collection("ji_zhang_biao")
                .getFullList<{ id: string }>({
                    filter: pb.filter(
                        "category = {:id} && user_id = {:userId}",
                        { id, userId: user.id },
                    ),
                    fields: "id",
                });

            for (
                let start = 0;
                start < rows.length;
                start += CLEAR_BATCH_SIZE
            ) {
                await Promise.all(
                    rows
                        .slice(start, start + CLEAR_BATCH_SIZE)
                        .map((row) =>
                            pb
                                .collection("ji_zhang_biao")
                                .update(row.id, { category: "" }),
                        ),
                );
            }

            await pb.collection("ji_zhang_category").delete(id);
            return rows.length;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: qk.jiZhang.all });
        },
    });
}
