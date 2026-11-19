import type { ChatMessage } from "./types";

/**
 * Add a just-created message to a model history unless that row is already in
 * it.
 *
 * `send()` persists the user turn before it starts the run, and both the
 * message query cache and the run store's optimistic list pick that row up, so
 * `messagesRef.current` usually already contains it. A plain spread then sent
 * the same turn to the model twice (#98). Dedupe by row id, never by text:
 * deliberately sending the same sentence twice must stay two turns.
 */
export function appendUniqueMessage(
    history: readonly ChatMessage[],
    message: ChatMessage,
): ChatMessage[] {
    if (history.some((row) => row.id === message.id)) {
        return [...history];
    }
    return [...history, message];
}
