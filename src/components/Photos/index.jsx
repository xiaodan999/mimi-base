import { useEffect, useState } from "react";
import { Outlet } from "react-router-dom";
import Compressor from "compressorjs";

import { useUser } from "../../contexts/AuthContext";
import supabase from "../../supabase-client/supabase";
import { formatDate } from "../../utils/date";
import Spinner from "../Spinner";

export default function Photos() {
  const [photos, setPhotos] = useState([]);
  const [loading, setLoading] = useState(false);

  async function loadData() {
    setLoading(true);
    let { data, error } = await supabase
      .from("tu-pian-xin-xi")
      .select("user_id,photo,id,created_at,users(user_name)")
      .order("created_at", { ascending: false });
    const transformed = data.map((p) => ({
      ...p,
      name: p.users.user_name,
      photo: supabase.storage.from("hao-duo-zhao-pian").getPublicUrl(p.photo).data.publicUrl,
    }));
    setPhotos(transformed);
    setLoading(false);
  }

  useEffect(() => {
    loadData();
  }, []);

  return (
    <div style={{ height: "100%", overflowY: "scroll" }}>
      <Header refresh={loadData} />
      {loading && (
        <div style={{ display: "flex", justifyContent: "center" }}>
          <Spinner />
        </div>
      )}
      {photos.map((photo) => {
        return (
          <div key={photo.id}>
            <Photo name={photo.name} photoUrl={photo.photo} date={formatDate(photo.created_at)} />
            <Line />
          </div>
        );
      })}
      <Outlet />
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
function Photo({ name, date, photoUrl }) {
  return (
    <div style={{ padding: "0px 20px" }}>
      <p style={{ marginBottom: "5px", fontSize: "20px" }}>{name}：</p>
      <img
        style={{ borderRadius: "15px", width: "100%", height: "250px", objectFit: "cover" }}
        src={photoUrl}
        alt="hezhao"
      />
      <p style={{ textAlign: "end" }}>{date}</p>
    </div>
  );
}
function Header({ refresh }) {
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
            const type = file.type.split("/")[1];
            setLoading(true);
            new Compressor(file, {
              quality: 0.6,
              async success(compressed) {
                const { data, error } = await supabase.storage
                  .from("hao-duo-zhao-pian")
                  .upload("photos/" + Date.now() + "." + type, compressed);
                if (error) {
                  // Handle error
                } else {
                  // Handle success
                  const path = data.path;

                  await supabase.from("tu-pian-xin-xi").insert([{ user_id: user.id, photo: path }]);
                  refresh();
                }
                setLoading(false);
              },
            });
          }}
        />
      </label>
    </div>
  );
}
