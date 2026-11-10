import { WifiOff } from "lucide-react";
import { useEffect, useState } from "react";

/** Slim bar above the bottom nav while the browser reports no connection. */
export default function OfflineBanner() {
    const [offline, setOffline] = useState(false);

    useEffect(() => {
        const update = () => setOffline(!navigator.onLine);
        update();
        window.addEventListener("online", update);
        window.addEventListener("offline", update);
        return () => {
            window.removeEventListener("online", update);
            window.removeEventListener("offline", update);
        };
    }, []);

    if (!offline) return null;

    return (
        <div
            role="status"
            className="flex items-center justify-center gap-1.5 border-t border-warning/20 bg-warning/10 px-3 py-1.5 text-[11px] font-semibold text-warning"
        >
            <WifiOff className="size-3.5" aria-hidden="true" />
            当前没有网络，显示的是缓存内容
        </div>
    );
}
