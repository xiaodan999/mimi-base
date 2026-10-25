import { useInfiniteQuery } from "@tanstack/react-query";

import type { User } from "@/lib/auth";
import pb from "@/lib/pb";

export type PhotoData = {
    user: User;
    id: string;
    created_at: string;
    url: string;
    storagePath: string;
};

// biome-ignore lint/suspicious/noExplicitAny: <explanation>
function transform(data: any[]): PhotoData[] {
    // biome-ignore lint/suspicious/noExplicitAny: <explanation>
    const transformed = data.map((p: any) => ({
        id: p.id,
        created_at: p.created,
        storagePath: p.photo,
        // the photo field declares thumbs: ["200x200"], the grid displays at
        // 250x330 with object-cover so the square thumb is enough
        url: p.photo ? pb.files.getURL(p, p.photo, { thumb: "200x200" }) : "",
        user: p.expand?.user_id,
    }));
    return transformed;
}

async function fetchPhotos(cursor: string | null, limit: number) {
    const options: {
        sort: string;
        expand: string;
        filter?: string;
    } = {
        sort: "-created",
        expand: "user_id,user_id.circle",
    };

    if (cursor) {
        options.filter = pb.filter("created < {:cursor}", { cursor });
    }

    // `limit` acts as the perPage of the first page
    const result = await pb
        .collection("tu_pian_xin_xi")
        .getList(1, limit, options);
    return result.items;
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
    const nextCursor: string | null = data.at(-1)?.created ?? null; // Set the value of nextCursor

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
