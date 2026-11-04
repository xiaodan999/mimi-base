/**
 * Single source of truth for React Query keys.
 *
 * Every per-user cache includes the user id, so switching accounts can never
 * serve another user's cached rows. Mutations invalidate the `all` prefixes,
 * which match every user-scoped variant.
 */
export const qk = {
    posts: {
        all: ["posts"] as const,
        list: (userId: string) => ["posts", userId] as const,
    },
    comments: {
        root: ["comments"] as const,
        all: (postId: string) => ["comments", postId] as const,
    },
    circles: {
        all: ["tou-xiang-circle"] as const,
        mine: (userId: string) => ["tou-xiang-circle", userId] as const,
    },
    jiZhang: {
        all: ["ji-zhang"] as const,
        list: (userId: string, from?: Date, to?: Date) =>
            [
                "ji-zhang",
                userId,
                from?.toISOString() ?? null,
                to?.toISOString() ?? null,
            ] as const,
    },
    studyProgress: (userId: string, subjectId: string) =>
        ["study-progress", subjectId, userId] as const,
    studySummaries: (userId: string) => ["study-summaries", userId] as const,
    homeStats: {
        all: ["home-stats"] as const,
        get: (userId: string, day: string) =>
            ["home-stats", userId, day] as const,
    },
};
