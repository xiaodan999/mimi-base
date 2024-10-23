import type { User } from "@/lib/auth";
import supabase from "@/lib/supabase-client";
import { useInfiniteQuery } from "@tanstack/react-query";

export type PhotoData = {
	user: User;
	id: string;
	created_at: string;
	url: string;
	storagePath: string;
};

// biome-ignore lint/suspicious/noExplicitAny: <explanation>
function transform(data: any): PhotoData[] {
	// biome-ignore lint/suspicious/noExplicitAny: <explanation>
	const transformed = data.map((p: any) => ({
		...p,
		storagePath: p.photo,
		url: supabase.storage.from("hao-duo-zhao-pian").getPublicUrl(p.photo).data
			.publicUrl,
	}));
	return transformed;
}

async function fetchPhotos(cursor: string | null, limit: number) {
	// Fetch photos from the database using supabase
	let query = supabase
		.from("tu-pian-xin-xi")
		.select(
			"photo,id,created_at,user:users(id,user_name,tou_xiang,...tou-xiang-circle(circle:url))",
		)
		.order("created_at", { ascending: false })
		.limit(limit);

	if (cursor) {
		query = query.lt("created_at", cursor);
	}

	const { data, error } = await query;

	if (error) throw error;
	// biome-ignore lint/suspicious/noExplicitAny: <explanation>
	return data as any[];
}

async function getPhotos(cursor: string, limit = 10) {
	// biome-ignore lint/suspicious/noImplicitAnyLet: <explanation>
	let data;
	if (cursor === "initial") {
		// If cursor is "initial", fetch the first set of photos
		data = await fetchPhotos(null, limit);
	} else {
		// If cursor is not "initial", fetch the next set of photos
		data = await fetchPhotos(cursor, limit);
	}

	const photos = transform(data); // Transform the first limit photos in the data array
	const nextCursor: string | null = data.at(-1)!.created_at ?? null; // Set the value of nextCursor

	return { photos, nextCursor, limit }; // Return an object containing the photos array, nextCursor value and limit
}

export default function usePhotos() {
	return useInfiniteQuery({
		queryKey: ["photos"],
		queryFn: ({ pageParam = "initial" }) => {
			return getPhotos(pageParam); // Call the getPhotos function with the pageParam as the cursor argument
		},
		getNextPageParam: (lastpage) => {
			return lastpage.nextCursor; // Return the value of nextCursor from the last page of data
		},
		initialPageParam: "initial",
	});
}
