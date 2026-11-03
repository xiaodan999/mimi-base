import {
    keepPreviousData,
    queryOptions,
    useMutation,
    useQuery,
    useQueryClient,
} from "@tanstack/react-query";
import { endOfDay, startOfDay, startOfMonth } from "date-fns/esm";
import { DateRange } from "react-day-picker";

import { useCurrentUser } from "@/lib/auth";
import { getDateString } from "@/lib/date";
import groupBy from "@/lib/groupBy";
import pb, { pbDate } from "@/lib/pb";
import { qk } from "@/lib/query-keys";

export type JiZhangItemData = {
    id: string;
    price: number;
    itemName: string;
    createdAt: string;
    /** Empty for rows created before the category field was added. */
    category: string;
};

type JiZhangRecord = {
    id: string;
    item_name: string;
    price: number;
    created: string;
    category?: string;
};

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
        queryFn: async () => {
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
                });

            const transformedData: {
                date: string;
                items: JiZhangItemData[];
            }[] = [];

            groupBy(
                rawData.map((item) => ({
                    id: item.id,
                    price: item.price,
                    itemName: item.item_name,
                    createdAt: item.created,
                    category: item.category ?? "",
                })),
                (item) => getDateString(new Date(item.createdAt)),
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
        mutationKey: ["add-ji-zhang"],
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
        mutationKey: ["delete-ji-zhang"],
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
