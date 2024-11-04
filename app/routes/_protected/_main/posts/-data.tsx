import { useQuery } from "@tanstack/react-query";

import { User } from "@/lib/auth";
import supabase from "@/lib/supabase-client";

export type PostData = {
    id: string;
    text: string;
    author: User;
    createdAt: string;
    metrics: {
        likeCount: number;
        replyCount: number;
    };
};

// export type CommentData = {
//     id: string;
//     text: string;
// };

export function usePosts() {
    return useQuery({
        queryKey: ["posts"],
        queryFn: async () => {
            const { data: posts } = await supabase
                .from("posts")
                .select(
                    `id, text, author:users(id,user_name,tou_xiang,...tou-xiang-circle(circle:url)), 
                     createdAt:created_at, post_likes!inner(count), comments!inner(count)`,
                )
                .order("created_at", { ascending: false })
                .throwOnError();
            if (!posts) throw new Error("Cannot find any posts.");
            posts.forEach((post) => {
                // @ts-expect-error new type
                post.metrics = {
                    // @ts-expect-error silly sb
                    likeCount: post.post_likes[0].count,
                    // @ts-expect-error silly sb
                    replyCount: post.comments[0].count,
                };
            });
            return posts as unknown as PostData[];
        },
    });
}
