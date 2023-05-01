import { useInfiniteQuery } from "@tanstack/react-query";

import supabase from "@src/supabase-client/supabase";

function transform(data) {
  const transformed = data.map((p) => ({
    ...p,
    name: p.users.user_name,
    photoPath: p.photo,
    photo: supabase.storage.from("hao-duo-zhao-pian").getPublicUrl(p.photo).data.publicUrl,
  }));
  return transformed;
}

async function getPhotos(cursor, limit = 10) {
  if (cursor === "initial") {
    const { data, error } = await supabase
      .from("tu-pian-xin-xi")
      .select("user_id,photo,id,created_at,users(user_name)")
      .order("created_at", { ascending: false })
      .limit(limit + 1);
    if (error) throw error;
    return { photos: transform(data.slice(0, 10)), nextCursor: data.at(-1).created_at, limit };
  } else {
    const { data, error } = await supabase
      .from("tu-pian-xin-xi")
      .select("user_id,photo,id,created_at,users(user_name)")
      .lte("created_at", cursor)
      .order("created_at", { ascending: false })
      .limit(limit + 1);
    if (error) throw error;

    return {
      photos: transform(data.slice(0, 10)),
      nextCursor: data.length < limit ? null : data.at(-1).created_at,
      limit,
    };
  }
}

export default function usePhotos() {
  return useInfiniteQuery({
    queryKey: ["photos"],
    queryFn: ({ pageParam = "initial" }) => {
      return getPhotos(pageParam);
    },
    getNextPageParam: (lastpage) => {
      return lastpage.nextCursor;
    },
  });
}
