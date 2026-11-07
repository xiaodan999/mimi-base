import { useCallback, useSyncExternalStore } from "react";

import type { BrowserLocation } from "./location";

export type UserInputKind =
    "text" | "choice" | "confirm" | "location" | "expense";

export type UserInputExpense = {
    item: string;
    price: number;
    category: string;
};

export type UserInputRequest = {
    question: string;
    kind: UserInputKind;
    /**
     * The conversation whose run asked. A run keeps waiting when the user
     * navigates away, so the panel only shows in that conversation.
     */
    conversationId?: string;
    /** For kind="choice". */
    options?: string[];
    placeholder?: string;
    /** For kind="expense": the draft row the user is asked to confirm. */
    expense?: UserInputExpense;
};

export type UserInputAnswer =
    | {
          ok: true;
          answer?: string;
          location?: BrowserLocation;
      }
    | { ok: false; error: string };

type Pending = {
    request: UserInputRequest;
    resolve: (answer: UserInputAnswer) => void;
};

let pending: Pending | null = null;
const listeners = new Set<() => void>();

function notify() {
    for (const listener of listeners) listener();
}

/**
 * A tool call can pause here until the user answers. Only one request is
 * pending at a time because the model's tool loop is sequential.
 */
export function requestUserInput(
    request: UserInputRequest,
): Promise<UserInputAnswer> {
    if (pending) {
        return Promise.resolve({
            ok: false,
            error: "已经有一个问题在等待回答",
        });
    }
    return new Promise<UserInputAnswer>((resolve) => {
        pending = { request, resolve };
        notify();
    });
}

export function getPendingUserInput(): UserInputRequest | null {
    return pending?.request ?? null;
}

export function subscribeUserInput(listener: () => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
}

export function answerUserInput(answer: UserInputAnswer): void {
    const current = pending;
    if (!current) return;
    pending = null;
    notify();
    current.resolve(answer);
}

export function cancelUserInput(error = "用户取消了请求"): void {
    answerUserInput({ ok: false, error });
}

/**
 * Cancel only the question owned by one conversation. A run in another
 * conversation keeps waiting (and its panel reappears when the user returns).
 */
export function cancelUserInputFor(
    conversationId: string,
    error = "用户取消了请求",
): void {
    const current = pending;
    if (!current || current.request.conversationId !== conversationId) return;
    answerUserInput({ ok: false, error });
}

export function hasPendingUserInput(conversationId?: string): boolean {
    const current = pending;
    if (!current) return false;
    return (
        conversationId === undefined ||
        current.request.conversationId === conversationId
    );
}

/**
 * Cancel reasons produced by navigation or stopping rather than an explicit
 * user answer. The reload-resume path treats these as "leave the question
 * open" instead of persisting a failure, so an accidental back-swipe does not
 * burn the question.
 */
export function isTransientCancelReason(error: string): boolean {
    return (
        error === "用户离开了当前页面" ||
        error === "对话已切换" ||
        error === "生成已结束" ||
        error === "用户停止了生成"
    );
}

/** Subscribe in the panel; it re-renders when a request appears/clears. */
export function usePendingUserInput(
    conversationId?: string,
): UserInputRequest | null {
    const read = useCallback(() => {
        const request = getPendingUserInput();
        if (!request) return null;
        if (conversationId && request.conversationId !== conversationId) {
            return null;
        }
        return request;
    }, [conversationId]);
    return useSyncExternalStore(subscribeUserInput, read, read);
}
