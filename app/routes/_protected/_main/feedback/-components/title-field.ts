import type { KeyboardEvent } from "react";

/**
 * Shared behavior for the feedback title inputs (#92). The IME action is
 * "done" and Enter only dismisses the keyboard: there is no form to submit
 * and the submit button stays separate.
 */
export function blurOnEnter(event: KeyboardEvent<HTMLInputElement>) {
    // Enter also confirms an IME candidate; don't steal that key.
    if (event.nativeEvent.isComposing || event.key !== "Enter") return;
    event.preventDefault();
    event.currentTarget.blur();
}
