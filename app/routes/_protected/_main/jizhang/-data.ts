import { keepPreviousData, useMutation, useQuery } from "@tanstack/react-query";
import { endOfDay, startOfDay } from "date-fns/esm";
import { DateRange } from "react-day-picker";

import { queryClient } from "@/app/main";
import { formatDate } from "@/lib/date";
import groupBy from "@/lib/groupBy";
import supabase from "@/lib/supabase-client";

export type JiZhangItemData = {
    id: string;
    price: number;
    itemName: string;
    createdAt: string;
};

export function useJiZhang(range: DateRange | undefined) {
    const { from, to } = range ?? {};
    return useQuery({
        queryKey: ["ji-zhang", from, to],
        queryFn: async () => {
            if (range === undefined || from === undefined) return [];

            const query = supabase
                .from("ji_zhang_biao")
                .select("id, price, itemName:item_name, createdAt:created_at");
            // single day
            if (to === undefined) {
                query
                    .gte("created_at", startOfDay(from).toISOString())
                    .lte("created_at", endOfDay(from).toISOString());
            }
            // range
            else {
                query
                    .gte("created_at", startOfDay(from).toISOString())
                    .lte("created_at", endOfDay(to).toISOString());
            }

            const { data: rawData } = await query
                .order("created_at", { ascending: false })
                .throwOnError();
            if (rawData === null) throw new Error("没有找到记账数据");

            const transformedData: {
                date: string;
                items: JiZhangItemData[];
            }[] = [];

            groupBy(rawData, (item) => myFormatDate(item.createdAt)).forEach(
                (items, date) => {
                    transformedData.push({ date, items });
                },
            );

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
    return useMutation({
        mutationKey: ["add-ji-zhang"],
        mutationFn: async (
            newItem: Pick<JiZhangItemData, "itemName" | "price">,
        ) => {
            const { data } = await supabase
                .from("ji_zhang_biao")
                .insert({
                    item_name: newItem.itemName,
                    price: newItem.price,
                })
                .select("id")
                .single()
                .throwOnError();
            if (!data) throw new Error("Failed to insert a new ji zhang");
            return data.id;
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
            const { count } = await supabase
                .from("ji_zhang_biao")
                .delete({ count: "exact" })
                .eq("id", itemToDelete.id)
                .single()
                .throwOnError();

            if (count !== 1) throw new Error("Failed to delete");
        },
        onSuccess: () => {
            queryClient.invalidateQueries({
                queryKey: ["ji-zhang"],
            });
        },
    });
}
