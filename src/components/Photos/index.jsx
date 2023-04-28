import { useEffect, useState } from "react";
import Compressor from "compressorjs";

import { useUser } from "../../contexts/AuthContext";
import supabase from "../../supabase-client/supabase";
import { formatDate } from "../../utils/date";
import Spinner from "../Spinner";
import InfiniteScroll from "../InfiniteScroll";
import styles from "./index.module.css";
import { ImageViewer, SwipeAction, Toast } from "antd-mobile";
import { UploadOutline } from "antd-mobile-icons";

export default function Photos() {
  const [photos, setPhotos] = useState([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);

  async function loadMore() {
    const size = 10;
    const { count } = await supabase
      .from("tu-pian-xin-xi")
      .select("*", { count: "exact", head: true });

    const { from, to, hasMore } = getPagination(page, size, count);
    let { data, error } = await supabase
      .from("tu-pian-xin-xi")
      .select("user_id,photo,id,created_at,users(user_name)")
      .order("created_at", { ascending: false })
      .range(from, to);

    if (error) {
      throw error;
    }
    setHasMore(hasMore);
    const transformed = data.map((p) => ({
      ...p,
      name: p.users.user_name,
      photoPath: p.photo,
      photo: supabase.storage.from("hao-duo-zhao-pian").getPublicUrl(p.photo).data.publicUrl,
    }));
    setPhotos((prev) => [...prev, ...transformed]);
    setPage((prev) => prev + 1);
  }

  useEffect(() => {
    loadMore();
  }, []);

  return (
    <div style={{ height: "100%", overflowY: "scroll", paddingBottom: "40px" }}>
      <Header onAdd={(newPhoto) => setPhotos((prev) => [newPhoto, ...prev])} />

      {photos.map((photo) => {
        return (
          <div key={photo.id}>
            <Photo
              name={photo.name}
              photoPath={photo.photoPath}
              photoUrl={photo.photo}
              date={formatDate(photo.created_at)}
              id={photo.id}
              onDelete={(id) => {
                setPhotos(photos.filter((p) => p.id !== id));
              }}
            />
            <Line />
          </div>
        );
      })}
      <InfiniteScroll hasMore={hasMore} loadMore={loadMore} />
    </div>
  );
}

function Line() {
  return (
    <div
      style={{ margin: "12px 0", height: "0.5px", width: "100%", backgroundColor: "#4c5fcd" }}
    ></div>
  );
}
function Photo({ name, date, photoUrl, photoPath, id, onDelete }) {
  return (
    <div className={styles.photo}>
      <p className={styles.name}>{name}：</p>
      <div className={styles.swipeWrapper}>
        <SwipeAction
          rightActions={[
            {
              key: "delete",
              text: "删除",
              color: "danger",
              onClick: async () => {
                const { error } = await supabase.from("tu-pian-xin-xi").delete().eq("id", id);
                await supabase.storage.from("hao-duo-zhao-pian").remove([photoPath]);
                if (!error) {
                  Toast.show({
                    icon: "success",
                    content: "删除成功",
                  });
                }
                onDelete(id);
              },
            },
          ]}
        >
          <div className={styles.imageWrapper}>
            <img
              className={styles.image}
              src={photoUrl}
              alt="hezhao"
              loading="lazy"
              onClick={() => {
                ImageViewer.show({ image: photoUrl });
              }}
            />
          </div>
        </SwipeAction>
      </div>

      <p className={styles.footer}>{date}</p>
    </div>
  );
}
function Header({ onAdd }) {
  const [user] = useUser();
  const [loading, setLoading] = useState(false);
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        paddingLeft: "20px",
        paddingRight: "20px",
        marginTop: "15px",
        marginBottom: "15px",
      }}
    >
      <h1 style={{ fontSize: "40px" }}>小蛋小海日常</h1>
      <label htmlFor="image-upload">
        {loading ? (
          <Spinner />
        ) : (
          <button
            style={{
              width: "50px",
              height: "50px",
              borderRadius: "60px",
              fontSize: "40px",
              color: "#4c5fcd",
              backgroundColor: "var(--accent-color)",
              border: "1px solid #4c5fcd",
              pointerEvents: "none",
            }}
          >
            +
          </button>
        )}
        <input
          hidden
          disabled={loading}
          id="image-upload"
          type="file"
          accept="image/*"
          onChange={async (e) => {
            const file = e.target.files[0];
            if (!file) return;
            setLoading(true);
            const handler = Toast.show({
              content: "上传中",
              icon: <UploadOutline />,
              duration: 0,
            });
            new Compressor(file, {
              quality: 0.1,
              mimeType: "image/webp",
              async success(compressed) {
                const { data, error } = await supabase.storage
                  .from("hao-duo-zhao-pian")
                  .upload("photos/" + Date.now() + ".webp", compressed);
                if (error) {
                  // Handle error
                } else {
                  // Handle success
                  const path = data.path;

                  const { data: newItem } = await supabase
                    .from("tu-pian-xin-xi")
                    .insert([{ user_id: user.id, photo: path }])
                    .select("user_id,photo,id,created_at,users(user_name)")
                    .single();
                  onAdd({
                    ...newItem,
                    name: newItem.users.user_name,
                    photoPath: newItem.photo,
                    photo: supabase.storage.from("hao-duo-zhao-pian").getPublicUrl(newItem.photo)
                      .data.publicUrl,
                  });
                }
                handler.close();
                setLoading(false);
              },
            });
          }}
        />
      </label>
    </div>
  );
}

export const getPagination = (page, size, totalCount) => {
  const limit = size ? +size : 3;
  const from = page ? (page - 1) * limit : 0;
  let to = page ? page * limit - 1 : limit - 1;
  if (to >= totalCount) {
    to = totalCount - 1;
  }
  const hasMore = to < totalCount - 1;
  return { from, to, hasMore };
};
