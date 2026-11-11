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
        /** Prefix shared by every feed variant (latest / month / search). */
        lists: (userId: string) => ["posts", userId] as const,
        list: (userId: string, filter = "latest") =>
            ["posts", userId, filter] as const,
        months: (userId: string) => ["posts", "months", userId] as const,
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
        uncategorized: (userId: string, includeOther = false) =>
            ["ji-zhang", "uncategorized", userId, includeOther] as const,
        categories: {
            all: ["ji-zhang", "categories"] as const,
            of: (userId: string) => ["ji-zhang", "categories", userId] as const,
        },
    },
    studyProgress: (userId: string, subjectId: string) =>
        ["study-progress", subjectId, userId] as const,
    /** Prefix for every subject's progress row. */
    studyProgressAll: ["study-progress"] as const,
    studySummaries: (userId: string) => ["study-summaries", userId] as const,
    /** Prefix used by the study overview and the realtime sync. */
    studySummariesAll: ["study-summaries"] as const,
    homeStats: {
        all: ["home-stats"] as const,
        get: (userId: string, day: string) =>
            ["home-stats", userId, day] as const,
    },
    notifications: {
        all: ["notifications"] as const,
        list: (userId: string) => ["notifications", "list", userId] as const,
        unread: (userId: string) =>
            ["notifications", "unread", userId] as const,
    },
    memories: (userId: string, day: string) =>
        ["memories", userId, day] as const,
    dinner: {
        all: ["dinner-options"] as const,
        /** Shared between the couple; the user id still isolates the cache. */
        options: (userId: string) => ["dinner-options", userId] as const,
    },
    yearReport: (userId: string, year: number) =>
        ["year-report", userId, year] as const,
    /** Prefix for every year's report. */
    yearReportAll: ["year-report"] as const,
    feedback: {
        all: ["feedback"] as const,
        reports: (userId: string) => ["feedback", "reports", userId] as const,
        /** Shared suggestions; the user id still isolates the cache. */
        features: (userId: string) => ["feedback", "features", userId] as const,
        /** Live GitHub state for the issue numbers currently on screen. */
        issueStates: (userId: string, numbers: string) =>
            ["feedback", "issue-states", userId, numbers] as const,
    },
    chat: {
        all: ["chat"] as const,
        conversations: (userId: string) =>
            ["chat", "conversations", userId] as const,
        conversationsAll: ["chat", "conversations"] as const,
        conversation: (userId: string, conversationId: string) =>
            ["chat", "conversation", userId, conversationId] as const,
        conversationAll: ["chat", "conversation"] as const,
        messages: (userId: string, conversationId: string) =>
            ["chat", "messages", userId, conversationId] as const,
        messagesAll: ["chat", "messages"] as const,
        personas: (userId: string) => ["chat", "personas", userId] as const,
        personasAll: ["chat", "personas"] as const,
        memories: (userId: string) => ["chat", "memories", userId] as const,
        memoriesAll: ["chat", "memories"] as const,
        models: () => ["chat", "models"] as const,
    },
    /**
     * Mutation keys kept here too, so `useIsMutating` / devtools / future
     * matching can't drift from the strings used by the hooks. The exact
     * legacy strings are preserved.
     */
    mutations: {
        // posts
        postLike: () => ["mutate_post_like"] as const,
        newPost: () => ["new_post"] as const,
        updatePost: () => ["update_post"] as const,
        deletePost: () => ["delete_post"] as const,
        // comments (scoped per post)
        newComment: (postId: string) => ["new_comment", postId] as const,
        editComment: (postId: string) => ["edit_comment", postId] as const,
        deleteComment: (postId: string) => ["delete_comment", postId] as const,
        // ji_zhang_biao
        addJiZhang: () => ["add-ji-zhang"] as const,
        deleteJiZhang: () => ["delete-ji-zhang"] as const,
        updateJiZhang: () => ["update-ji-zhang"] as const,
        // ji_zhang_category
        createExpenseCategory: () => ["create-expense-category"] as const,
        updateExpenseCategory: () => ["update-expense-category"] as const,
        deleteExpenseCategory: () => ["delete-expense-category"] as const,
        // feedback
        retryFeedback: () => ["retry_feedback"] as const,
    },
};
