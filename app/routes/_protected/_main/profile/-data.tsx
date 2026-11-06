import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { useAuth, useCurrentUser } from "@/lib/auth";
import pb from "@/lib/pb";
import {
    type MyRing,
    type TouXiangCircleRecord,
    toMyRing,
} from "@/lib/pb-types";
import { qk } from "@/lib/query-keys";

// The view-model shape now lives in lib/pb-types.ts; keep re-exporting it.
export type { MyRing } from "@/lib/pb-types";

const RING_COLLECTION = "tou_xiang_circle";

export function useMyRings() {
    const user = useCurrentUser();
    return useQuery({
        queryKey: qk.circles.mine(user.id),
        queryFn: async ({ signal }): Promise<MyRing[]> => {
            const records = await pb
                .collection(RING_COLLECTION)
                .getFullList<TouXiangCircleRecord>({
                    filter: pb.filter("owner = {:owner}", { owner: user.id }),
                    sort: "-created",
                    signal,
                });
            return records.map(toMyRing);
        },
    });
}

/**
 * The avatar is mirrored into every cached post/comment expand, so changing
 * it has to refresh the profile and drop those caches together.
 */
function useRefreshAvatars() {
    const { refresh } = useAuth();
    const queryClient = useQueryClient();

    return () => {
        refresh();
        void queryClient.invalidateQueries({ queryKey: qk.posts.all });
        void queryClient.invalidateQueries({ queryKey: qk.comments.root });
    };
}

export function useSetAvatar() {
    const user = useCurrentUser();
    const refreshAvatars = useRefreshAvatars();

    return useMutation({
        mutationFn: (file: File) => {
            const formData = new FormData();
            formData.append("tou_xiang", file);
            return pb.collection("users").update(user.id, formData);
        },
        onSuccess: refreshAvatars,
    });
}

export function useSetRing() {
    const user = useCurrentUser();
    const refreshAvatars = useRefreshAvatars();

    return useMutation({
        mutationFn: (payload: { circle: string; circle_preset: string }) =>
            pb.collection("users").update(user.id, payload),
        onSuccess: refreshAvatars,
    });
}

export function useUploadRing() {
    const user = useCurrentUser();
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (file: File) => {
            const formData = new FormData();
            formData.append("name", "自定义头像框");
            formData.append("owner", user.id);
            formData.append("image", file);
            return pb.collection(RING_COLLECTION).create(formData);
        },
        onSuccess: () =>
            queryClient.invalidateQueries({ queryKey: qk.circles.all }),
    });
}

export function useDeleteRing() {
    const user = useCurrentUser();
    const refreshAvatars = useRefreshAvatars();
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (ring: MyRing) => {
            await pb.collection(RING_COLLECTION).delete(ring.id);
            // A dangling relation just renders no ring; clear it so the
            // default ring comes back right away.
            if (user.circle === ring.id) {
                await pb
                    .collection("users")
                    .update(user.id, { circle: "", circle_preset: "" });
            }
        },
        onSuccess: () => {
            refreshAvatars();
            return queryClient.invalidateQueries({
                queryKey: qk.circles.all,
            });
        },
    });
}

export function useUpdateNickname() {
    const user = useCurrentUser();
    const refreshAvatars = useRefreshAvatars();

    return useMutation({
        mutationFn: (userName: string) =>
            pb.collection("users").update(user.id, { user_name: userName }),
        onSuccess: refreshAvatars,
    });
}
