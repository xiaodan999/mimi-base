import { useSyncExternalStore } from "react";

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

/** Subscribe in the panel; it re-renders when a request appears/clears. */
export function usePendingUserInput(): UserInputRequest | null {
    return useSyncExternalStore(
        subscribeUserInput,
        getPendingUserInput,
        getPendingUserInput,
    );
}
