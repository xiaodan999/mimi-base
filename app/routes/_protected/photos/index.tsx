import { createFileRoute } from "@tanstack/react-router";
import { PlusCircle } from "lucide-react";
import usePhotos from "./-usePhotos";

export const Route = createFileRoute("/_protected/photos/")({
	component: Page,
});

function Page() {
	const { data, hasNextPage, fetchNextPage, status, error } = usePhotos();
	return (
		<div>
			<section>
				<h1>小丹和小海的照片</h1>
				<PlusCircle />
			</section>
			{status === "pending" ? (
				<p>Loading...</p>
			) : status === "error" ? (
				<span>Error: {error.message}</span>
			) : (
				<pre>{JSON.stringify(data, null, 2)}</pre>
			)}
		</div>
	);
}
