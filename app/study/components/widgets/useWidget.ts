import { useCallback } from "react";

import type { CardWidgetState } from "../../types";
import { useStudy } from "../StudyContext";

/**
 * 知识卡互动状态：读写 progress.widgets[cardId]。
 *
 * 每次互动都会把卡片标记为「看过」，并写入带 700ms 防抖的进度同步。
 * done 只表示「玩过这个互动」，不等于掌握；掌握仍由卡片底部的按钮决定。
 */
export function useWidgetState(cardId: string) {
    const { progress, update } = useStudy();
    const state = progress.widgets?.[cardId] ?? {};

    const patch = useCallback(
        (next: Partial<CardWidgetState>) => {
            update((current) => ({
                ...current,
                cards: {
                    ...current.cards,
                    [cardId]: { ...current.cards[cardId], seen: 1 },
                },
                widgets: {
                    ...(current.widgets ?? {}),
                    [cardId]: {
                        ...(current.widgets?.[cardId] ?? {}),
                        ...next,
                        updated: Date.now(),
                    },
                },
            }));
        },
        [cardId, update],
    );

    return { state, patch } as const;
}
