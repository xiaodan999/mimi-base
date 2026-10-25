import { keepPreviousData, useMutation, useQuery } from "@tanstack/react-query";
import { endOfDay, startOfDay } from "date-fns/esm";
import { DateRange } from "react-day-picker";

import { queryClient } from "@/app/main";
import { useAuth } from "@/lib/auth";
import { formatDate } from "@/lib/date";
import groupBy from "@/lib/groupBy";
import pb, { pbDate } from "@/lib/pb";

export type JiZhangItemData = {
    id: string;
    price: number;
    itemName: string;
    createdAt: string;
};

type JiZhangRecord = {
    id: string;
    item_name: string;
    price: number;
    created: string;
};

export function useJiZhang(range: DateRange | undefined) {
    const { from, to } = range ?? {};
    return useQuery({
        queryKey: ["ji-zhang", from, to],
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
                })),
                (item) => myFormatDate(item.createdAt),
            ).forEach((items, date) => {
                transformedData.push({ date, items });
            });

            return transformedData;
        },
        placeholderData: keepPreviousData,
    });
}

function myFormatDate(dateStr: string) {
    let myDate = formatDate(dateStr);
    myDate = myDate.split(" ")[0];
    return myDate.replaceAll("/", "-");
}

export function useAddJiZhang() {
    const { user } = useAuth();
    return useMutation({
        mutationKey: ["add-ji-zhang"],
        mutationFn: async (
            newItem: Pick<JiZhangItemData, "itemName" | "price">,
        ) => {
            // PocketBase has no column default for user_id, send it.
            const record = await pb.collection("ji_zhang_biao").create({
                item_name: newItem.itemName,
                price: newItem.price,
                user_id: user.id,
            });
            return record.id;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["ji-zhang"] });
        },
    });
}

export function useDeleteJiZhang() {
    return useMutation({
        mutationKey: ["delete-ji-zhang"],
        mutationFn: async (itemToDelete: Pick<JiZhangItemData, "id">) => {
            const deleted = await pb
                .collection("ji_zhang_biao")
                .delete(itemToDelete.id);
            if (!deleted) throw new Error("Failed to delete");
        },
        onSuccess: () => {
            queryClient.invalidateQueries({
                queryKey: ["ji-zhang"],
            });
        },
    });
}
