/**
 * 系统通知只负责「App 切到后台时也能看到」。
 * 权限由设置页在用户点击时申请，这里不主动打扰。
 */

export function notificationsSupported(): boolean {
    return typeof window !== "undefined" && "Notification" in window;
}

export function notificationPermission(): NotificationPermission | null {
    if (!notificationsSupported()) return null;
    return Notification.permission;
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

/** 有 Service Worker 就走 showNotification（手机上也更可靠），否则退回 Notification */
export function showSystemNotification(
    title: string,
    body?: string,
    tag?: string,
) {
    if (!notificationsSupported() || Notification.permission !== "granted") {
        return;
    }

    const options: NotificationOptions = { body, tag };
    const fallback = () => {
        try {
            const notification = new Notification(title, options);
            notification.onclick = () => window.focus();
        } catch {
            // 部分手机浏览器不支持直接 new Notification，忽略即可
        }
    };

    if ("serviceWorker" in navigator) {
        navigator.serviceWorker
            .getRegistration()
            .then((registration) => {
                if (!registration) {
                    fallback();
                    return;
                }
                return registration.showNotification(title, options);
            })
            .catch(fallback);
        return;
    }
    fallback();
}
