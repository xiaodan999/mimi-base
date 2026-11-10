import { isCirclePreset, NO_RING } from "@/components/TouXiang/presets";

export type RingSelection =
    | { kind: "default" }
    | { kind: "none" }
    | { kind: "preset"; key: string }
    | { kind: "custom"; id: string };

type RingUser = {
    circle?: string;
    circle_preset?: string;
};

const DEFAULT_SELECTION: RingSelection = { kind: "default" };

/** Mirrors `getUserRing`: an uploaded ring wins over a preset. */
export function selectionFromUser(
    user: RingUser | null | undefined,
): RingSelection {
    if (user?.circle) return { kind: "custom", id: user.circle };
    if (user?.circle_preset === NO_RING) return { kind: "none" };
    if (user?.circle_preset && isCirclePreset(user.circle_preset)) {
        return { kind: "preset", key: user.circle_preset };
    }
    return DEFAULT_SELECTION;
}

/** Fields to PATCH on the `users` record for a selection. */
export function ringPayload(selection: RingSelection): {
    circle: string;
    circle_preset: string;
} {
    switch (selection.kind) {
        case "none":
            return { circle: "", circle_preset: NO_RING };
        case "preset":
            return { circle: "", circle_preset: selection.key };
        case "custom":
            return { circle: selection.id, circle_preset: "" };
        default:
            return { circle: "", circle_preset: "" };
    }
}

export function isSameSelection(
    first: RingSelection,
    second: RingSelection,
): boolean {
    if (first.kind !== second.kind) return false;
    if (first.kind === "preset" && second.kind === "preset") {
        return first.key === second.key;
    }
    if (first.kind === "custom" && second.kind === "custom") {
        return first.id === second.id;
    }
    return true;
}
