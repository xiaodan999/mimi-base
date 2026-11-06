import { LoadingSpinner } from "@/components/ui/loading-spinner";

export default function LoadingPage() {
    return (
        <div
            role="status"
            aria-label="正在加载，请稍候"
            className="flex h-full items-center justify-center"
        >
            <LoadingSpinner size={40} />
        </div>
    );
}
