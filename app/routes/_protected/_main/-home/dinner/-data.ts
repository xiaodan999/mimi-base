import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { useCurrentUser } from "@/lib/auth";
import pb from "@/lib/pb";
import { qk } from "@/lib/query-keys";

import { DINNER_SEED, type DinnerOption } from "./options";

type DinnerOptionRecord = {
    id: string;
    name: string;
    created?: string;
};

/**
 * The couple's shared list of dinner choices. Reading and writing are
 * intentionally auth-only (like the feed and ledger): both partners manage
 * the same wheel, and the product has exactly two accounts.
 */
async function fetchDinnerOptions(): Promise<DinnerOption[]> {
    // Newest first: a just-added option is the first row in the manager
    // instead of hiding below 28 seeded ones.
    const rows = await pb
        .collection("dinner_options")
        .getFullList<DinnerOptionRecord>({ sort: "-created,name" });
    return rows.map(({ id, name, created }) => ({ id, name, created }));
}

/**
 * The collection starts empty on a fresh server. Fill it with the old
 * hardcoded menu once, then never touch it again. Concurrent first opens
 * race safely: the unique name index rejects duplicates and `allSettled`
 * lets the losers read the winner's rows.
 */
async function seedIfEmpty(): Promise<void> {
    const existing = await pb
        .collection("dinner_options")
        .getList(1, 1, { fields: "id" });
    if (existing.totalItems > 0) return;
    await Promise.allSettled(
        DINNER_SEED.map((name) =>
            pb.collection("dinner_options").create({ name }),
        ),
    );
}

export function useDinnerOptions() {
    const user = useCurrentUser();

    return useQuery({
        queryKey: qk.dinner.options(user.id),
        queryFn: async () => {
            await seedIfEmpty();
            return fetchDinnerOptions();
        },
        staleTime: 60_000,
    });
}

export function useAddDinnerOption() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (name: string) =>
            pb.collection("dinner_options").create({ name }),
        onSuccess: () =>
            queryClient.invalidateQueries({ queryKey: qk.dinner.all }),
    });
}

export function useRenameDinnerOption() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({ id, name }: { id: string; name: string }) =>
            pb.collection("dinner_options").update(id, { name }),
        onSuccess: () =>
            queryClient.invalidateQueries({ queryKey: qk.dinner.all }),
    });
}

export function useDeleteDinnerOption() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (id: string) => pb.collection("dinner_options").delete(id),
        onSuccess: () =>
            queryClient.invalidateQueries({ queryKey: qk.dinner.all }),
    });
}
