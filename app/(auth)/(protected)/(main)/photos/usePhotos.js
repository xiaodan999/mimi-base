import { useInfiniteQuery } from "@tanstack/react-query";

import supabase from "@src/supabase-client/supabase";

function transform(data) {
  const transformed = data.map((p) => ({
    ...p,
    photoPath: p.photo,
    photo: supabase.storage.from("hao-duo-zhao-pian").getPublicUrl(p.photo).data.publicUrl,
  }));
  return transformed;
}

async function fetchPhotos(cursor, limit) {
  // Fetch photos from the database using supabase
  let query = supabase
    .from("tu-pian-xin-xi")
    .select("user_id,photo,id,created_at,users(user_name,tou_xiang,tou-xiang-circle(url))")
    .order("created_at", { ascending: false })
    .limit(limit + 1);

  if (cursor) {
    query = query.lte("created_at", cursor);
  }

  const { data, error } = await query;

  if (error) throw error;
  return data;
}

async function getPhotos(cursor, limit = 10) {
  let data;
  if (cursor === "initial") {
    // If cursor is "initial", fetch the first set of photos
    data = await fetchPhotos(null, limit);
  } else {
    // If cursor is not "initial", fetch the next set of photos
    data = await fetchPhotos(cursor, limit);
  }

  const photos = transform(data.slice(0, limit)); // Transform the first limit photos in the data array
  const nextCursor = data[limit]?.created_at ?? null; // Set the value of nextCursor

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
  });
}
