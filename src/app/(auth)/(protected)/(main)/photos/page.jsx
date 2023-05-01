import { Fragment, useMemo } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ImageViewer, SwipeAction, Toast } from "antd-mobile";
import { UploadOutline } from "antd-mobile-icons";
import { Link } from "react-router-dom";

import usePhotos from "./usePhotos";
import styles from "./page.module.css";
import { formatDate } from "../../../../../utils/date";
import InfiniteScroll from "../../../../../components/InfiniteScroll";
import supabase from "../../../../../supabase-client/supabase";
import { useUser } from "../../../../../contexts/AuthContext";
import compressImage from "../../../../../utils/compressImage";
import Spinner from "../../../../../components/Spinner";

export default function Photos() {
  const { data, hasNextPage, fetchNextPage } = usePhotos();
  const photos = useMemo(() => {
    const allPhotos = [];
    data?.pages.forEach((page) => allPhotos.push(...page.photos));
    return allPhotos;
  }, [data]);

  return (
    <div style={{ height: "100%", overflowY: "scroll", paddingBottom: "40px" }}>
      <Header />
      {photos.map((photo) => (
        <Fragment key={photo.id}>
          <Photo
            id={photo.id}
            name={photo.name}
            photoPath={photo.photoPath}
            photoUrl={photo.photo}
            date={formatDate(photo.created_at)}
          />
          <Line />
        </Fragment>
      ))}

      <InfiniteScroll hasMore={hasNextPage} loadMore={() => fetchNextPage()} />
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
function Photo({ name, date, photoUrl, id }) {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationKey: ["photos"],
    mutationFn: async () => {
      const handler = Toast.show({
        icon: "loading",
        content: "删除中",
        duration: 0,
      });
      const { error, count } = await supabase
        .from("tu-pian-xin-xi")
        .delete({ count: "estimated" })
        .eq("id", id);
      handler.close();

      if (!error && count !== 0) {
        Toast.show({
          icon: "success",
          content: "删除成功",
        });
      } else {
        Toast.show({
          icon: "fail",
          content: "删除失败",
        });
        throw new Error("删除失败");
      }
    },
    onSuccess: async () => {
      queryClient.invalidateQueries({ queryKey: ["photos"] });
    },
  });

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
                mutation.mutate();
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

      <p className={styles.footer}>
        <Link to={`${id}`}>{date}</Link>
      </p>
    </div>
  );
}
function Header() {
  const [user] = useUser();
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationKey: ["photos"],
    mutationFn: async (file) => {
      const handler = Toast.show({
        content: "上传中",
        icon: <UploadOutline />,
        duration: 0,
      });
      const compressed = await compressImage(file);

      const path = `photos/${user.id}/${Date.now()}.webp`;
      const { error } = await supabase.storage
        .from("hao-duo-zhao-pian")
        .upload(path, compressed, { cacheControl: "31536000" });
      // cache the image for 1 year
      if (error) throw error;

      const { error: tableError } = await supabase
        .from("tu-pian-xin-xi")
        .insert([{ user_id: user.id, photo: path }]);
      if (tableError) throw tableError;

      handler.close();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["photos"] });
    },
  });

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
        {mutation.isLoading ? (
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
          disabled={mutation.isLoading}
          id="image-upload"
          type="file"
          accept="image/*"
          onChange={async (e) => {
            const file = e.target.files[0];
            if (!file) return;
            e.target.value = "";
            mutation.mutate(file);
          }}
        />
      </label>
    </div>
  );
}
