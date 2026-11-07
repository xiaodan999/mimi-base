import { useEffect, useRef, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";

import { DEFAULT_PERSONA_ID, resolvePersona } from "@/app/chat/personas";
import LoadingPage from "@/components/LoadingPage";

import { useChatActions, useChatModels } from "./_main/chat/-data";

type ShareSearch = { title?: string; text?: string; url?: string };

/** PWA share target: the OS share sheet lands here with title/text/url. */
export const Route = createFileRoute("/_protected/share")({
    validateSearch: (search: Record<string, unknown>): ShareSearch => ({
        title: typeof search.title === "string" ? search.title : undefined,
        text: typeof search.text === "string" ? search.text : undefined,
        url: typeof search.url === "string" ? search.url : undefined,
    }),
    component: SharePage,
});

function buildDraft(search: { title?: string; text?: string; url?: string }) {
    const parts = [search.title, search.text, search.url]
        .map((value) => value?.trim() ?? "")
        .filter((value) => value !== "");
    if (parts.length === 0) return "";
    return `看看这个：\n${parts.join("\n")}`;
}

function SharePage() {
    const navigate = useNavigate();
    const search: ShareSearch = Route.useSearch();
    const modelsQuery = useChatModels();
    const actions = useChatActions();
    const [failed, setFailed] = useState(false);
    const ranRef = useRef(false);
    const draft = buildDraft(search);

    useEffect(() => {
        if (ranRef.current || !modelsQuery.isSuccess) return;
        const defaultModel = modelsQuery.data?.defaultModel;
        if (!defaultModel) {
            if (modelsQuery.isError) setFailed(true);
            return;
        }
        ranRef.current = true;
        void (async () => {
            try {
                const created = await actions.createConversation({
                    title: draft === "" ? "分享内容" : "看看这个",
                    model: defaultModel,
                    thinking: "",
                    persona: resolvePersona(DEFAULT_PERSONA_ID),
                });
                await navigate({
                    to: "/chat/$conversationId",
                    params: { conversationId: created.id },
                    state: draft === "" ? undefined : { draft },
                    replace: true,
                });
            } catch {
                setFailed(true);
            }
        })();
    }, [
        actions,
        draft,
        modelsQuery.data,
        modelsQuery.isError,
        modelsQuery.isSuccess,
        navigate,
    ]);

    if (failed) {
        return (
            <div className="flex h-dvh flex-col items-center justify-center gap-3 px-6 text-center">
                <p className="text-sm text-muted-foreground">
                    分享没接上，打开应用直接粘贴也可以。
                </p>
                <button
                    type="button"
                    className="rounded-xl border border-border px-4 py-2 text-sm active:bg-accent"
                    onClick={() =>
                        void navigate({ to: "/chat", replace: true })
                    }
                >
                    去聊天页
                </button>
            </div>
        );
    }
    return <LoadingPage />;
}
