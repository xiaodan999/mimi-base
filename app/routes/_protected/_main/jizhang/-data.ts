import { keepPreviousData, useMutation, useQuery } from "@tanstack/react-query";

import { queryClient } from "@/app/main";
import { formatDate } from "@/lib/date";
import groupBy from "@/lib/groupBy";
import supabase from "@/lib/supabase-client";

type useJiZhangProps = {
    start: string;
    end: string;
};

export type JiZhangItemData = {
    id: string;
    price: number;
    itemName: string;
    createdAt: string;
};

export function useJiZhang({ start, end }: useJiZhangProps) {
    return useQuery({
        queryKey: ["ji-zhang", start, end],
        queryFn: async () => {
            if (start === "" && end === "") return [];

            const { data: rawData } = await supabase
                .from("ji_zhang_biao")
                .select("id, price, itemName:item_name, createdAt:created_at")
                .gte("created_at", start)
                .lte("created_at", end)
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
