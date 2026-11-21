let hideTimer: number | null = null;

/** 轻量 toast：直接挂到 body，不依赖组件树 */
export function toast(message: string) {
    document.querySelectorAll(".st-toast").forEach((node) => node.remove());
    const el = document.createElement("div");
    el.className = "st-toast";
    el.textContent = message;
    document.body.appendChild(el);
    if (hideTimer) window.clearTimeout(hideTimer);
    hideTimer = window.setTimeout(() => el.remove(), 1800);
}
