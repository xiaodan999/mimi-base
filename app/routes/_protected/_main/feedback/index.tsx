import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Bug, Lightbulb } from "lucide-react";
import { useEffect, useState } from "react";

import { useFeedbackRealtime } from "@/app/feedback/realtime";
import PageHeader from "@/components/PageHeader";
import { useCurrentUser } from "@/lib/auth";
import { cn } from "@/lib/utils";

import { BugPanel } from "./-components/bug-panel";
import { FeaturePanel } from "./-components/feature-panel";

type FeedbackTab = "bug" | "feature";

type FeedbackSearch = {
    /** `feature` deep-links the 功能建议 tab; omitted means 问题反馈. */
    tab?: "feature";
    /**
     * A chat conversation to attach to the bug report. Set by the 反馈问题
     * action in the chat thread, never picked on this page.
     */
    conversation?: string;
};

export const Route = createFileRoute("/_protected/_main/feedback/")({
    validateSearch: (search: Record<string, unknown>): FeedbackSearch => ({
        tab: search.tab === "feature" ? "feature" : undefined,
        conversation:
            typeof search.conversation === "string" && search.conversation
                ? search.conversation
                : undefined,
    }),
    component: Page,
});

const TABS: Array<{
    id: FeedbackTab;
    label: string;
    icon: typeof Bug;
}> = [
    { id: "bug", label: "问题反馈", icon: Bug },
    { id: "feature", label: "功能建议", icon: Lightbulb },
];

function Page() {
    const search = Route.useSearch();
    const navigate = useNavigate();
    const user = useCurrentUser();
    const tab: FeedbackTab = search.tab === "feature" ? "feature" : "bug";

    // Both lists are mounted after their first visit, so one registration
    // keeps either tab patched from realtime without a refetch.
    useFeedbackRealtime(user.id);

    // Mount a tab on first visit and keep it mounted afterwards: switching
    // tabs must not throw away a half-written draft. The `hidden` wrapper
    // keeps the inactive panel out of the layout and the accessibility tree.
    const [visited, setVisited] = useState<Record<FeedbackTab, boolean>>({
        bug: tab === "bug",
        feature: tab === "feature",
    });
    useEffect(() => {
        setVisited((current) =>
            current[tab] ? current : { ...current, [tab]: true },
        );
    }, [tab]);

    const switchTab = (next: FeedbackTab) => {
        if (next === tab) return;
        // `replace` keeps the browser back gesture going back to 个人资料
        // instead of walking through every tab the user tapped. The attached
        // conversation rides along so a tab switch does not detach it.
        void navigate({
            to: "/feedback",
            search: {
                tab: next === "feature" ? "feature" : undefined,
                conversation: search.conversation,
            },
            replace: true,
        });
    };

    // Only the 反馈问题 tab can hold a conversation; detaching rewrites the
    // URL so a reload stays detached. Other bug-draft fields are state in
    // BugPanel and survive the navigation.
    const detachConversation = () => {
        void navigate({
            to: "/feedback",
            search: { tab: search.tab, conversation: undefined },
            replace: true,
        });
    };

    return (
        <div className="mx-auto w-full max-w-md px-4 pt-[calc(1rem+env(safe-area-inset-top))] pb-10">
            <PageHeader
                backTo="/profile"
                backLabel="返回个人资料"
                title="反馈与建议"
                description="问题或建议都会自动整理成 GitHub Issue。"
            />

            <div
                aria-label="反馈类型"
                className="mt-4 grid grid-cols-2 gap-1 rounded-xl border border-border/60 bg-muted/40 p-1"
                role="tablist"
            >
                {TABS.map(({ id, label, icon: Icon }) => {
                    const active = tab === id;
                    return (
                        <button
                            key={id}
                            aria-controls={`feedback-panel-${id}`}
                            aria-selected={active}
                            className={cn(
                                "flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                                active
                                    ? "bg-card text-foreground shadow-soft"
                                    : "text-muted-foreground active:bg-accent",
                            )}
                            id={`feedback-tab-${id}`}
                            role="tab"
                            type="button"
                            onClick={() => switchTab(id)}
                        >
                            <Icon className="size-4" aria-hidden="true" />
                            {label}
                        </button>
                    );
                })}
            </div>

            {/* Wrappers always exist so each tab's aria-controls resolves;
                the content mounts on first visit and then stays mounted. */}
            <div
                aria-labelledby="feedback-tab-bug"
                hidden={tab !== "bug"}
                id="feedback-panel-bug"
                role="tabpanel"
            >
                {visited.bug && (
                    <BugPanel
                        conversationId={search.conversation}
                        onDetachConversation={detachConversation}
                    />
                )}
            </div>

            <div
                aria-labelledby="feedback-tab-feature"
                hidden={tab !== "feature"}
                id="feedback-panel-feature"
                role="tabpanel"
            >
                {visited.feature && <FeaturePanel />}
            </div>
        </div>
    );
}
