import type { ChatConversation, ChatPersona } from "./types";

/**
 * List-page helpers: pinned conversations float to the top (most recent
 * first inside each group), and search/filter are client-side over the
 * already-loaded list.
 */

export function sortConversations(
    conversations: readonly ChatConversation[],
): ChatConversation[] {
    return [...conversations].sort((a, b) => {
        if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
        return b.updatedAt.localeCompare(a.updatedAt);
    });
}

export function conversationMatchesQuery(
    conversation: ChatConversation,
    query: string,
): boolean {
    const needle = query.trim().toLowerCase();
    if (needle === "") return true;
    return (
        conversation.title.toLowerCase().includes(needle) ||
        conversation.lastMessage.toLowerCase().includes(needle) ||
        conversation.personaName.toLowerCase().includes(needle)
    );
}

export function filterConversations(
    conversations: readonly ChatConversation[],
    query: string,
    personaId: string,
): ChatConversation[] {
    return sortConversations(conversations).filter(
        (conversation) =>
            (personaId === "all" || conversation.personaId === personaId) &&
            conversationMatchesQuery(conversation, query),
    );
}

/** Persona chips for the conversations actually present in the list. */
export function listPersonaChips(
    conversations: readonly ChatConversation[],
    personas: readonly ChatPersona[],
): Array<{ id: string; name: string; icon: string; count: number }> {
    const counts = new Map<string, number>();
    const snapshotNames = new Map<string, string>();
    for (const conversation of conversations) {
        counts.set(
            conversation.personaId,
            (counts.get(conversation.personaId) ?? 0) + 1,
        );
        if (!snapshotNames.has(conversation.personaId)) {
            snapshotNames.set(conversation.personaId, conversation.personaName);
        }
    }
    const chips: Array<{
        id: string;
        name: string;
        icon: string;
        count: number;
    }> = [];
    for (const [id, count] of counts) {
        const persona = personas.find((item) => item.id === id);
        chips.push({
            id,
            name: persona?.name ?? snapshotNames.get(id) ?? "对话",
            icon: persona?.icon ?? "💬",
            count,
        });
    }
    return chips.sort((a, b) => b.count - a.count);
}
