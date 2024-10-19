import { LoadingSpinner } from "../ui/loading-spinner";

export default function LoadingPage() {
  return (
    <div
     className="flex justify-center items-center h-full"
    >
     <LoadingSpinner size={40} />
    </div>
  );
}
