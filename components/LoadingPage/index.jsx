import { LoadingSpinner } from "../ui/loading-spinner";

export default function LoadingPage() {
    return (
        <div className="flex h-full items-center justify-center">
            <LoadingSpinner size={40} />
        </div>
    );
}
