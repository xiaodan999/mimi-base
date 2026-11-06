/**
 * 系统通知只负责「App 切到后台时也能看到」。
 * 权限由设置页在用户点击时申请，这里不主动打扰。
 */

export function notificationsSupported(): boolean {
    return typeof window !== "undefined" && "Notification" in window;
}

export async function requestSystemNotifications(): Promise<boolean> {
    if (!notificationsSupported()) return false;
    if (Notification.permission === "granted") return true;
    if (Notification.permission === "denied") return false;
    try {
        return (await Notification.requestPermission()) === "granted";
    } catch {
        return false;
    }
}

/**
 * 「只在页面隐藏时通知」的判断集中在这里，调用方只管传开关，别再各自
 * 读 document.visibilityState。通知点击要回到用户当时所在的页面，所以
 * data.pathname 必须带上（sw.js 的 notificationclick 靠它决定聚焦/打开哪一个）。
 *
 * 手机上 `new Notification()` 会直接抛错，这里只走 Service Worker 的
 * showNotification；没有注册 SW（比如 dev）就安静地什么都不做。
 */
export function showSystemNotification(
    title: string,
    body?: string,
    tag?: string,
) {
    if (!notificationsSupported() || Notification.permission !== "granted") {
        return;
    }
    // 前台可见时结果已经在界面上了，不再弹系统通知。
    if (
        typeof document !== "undefined" &&
        document.visibilityState === "visible"
    ) {
        return;
    }
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) {
        return;
    }

    const options: NotificationOptions & { data: { pathname: string } } = {
        body,
        tag,
        data: {
            pathname: typeof location !== "undefined" ? location.pathname : "/",
        },
    };

    navigator.serviceWorker
        .getRegistration()
        .then((registration) => registration?.showNotification(title, options))
        .catch(() => {
            // 部分手机浏览器不支持 showNotification，静默失败即可
        });
}
