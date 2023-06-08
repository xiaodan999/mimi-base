import TouXiang from "@src/components/TouXiang";
import supabase from "@src/supabase-client/supabase";
import { Button, Toast } from "antd-mobile";
import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

function Page() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [url, setUrl] = useState("");
  const [error, setError] = useState(null);

  useEffect(() => {
    async function getPhoto() {
      const { data } = await supabase.from("tu-pian-xin-xi").select("photo").eq("id", id).single();
      if (data === null) {
        setError("照片不存在");
        setUrl("");
        return;
      }
      const {
        data: { publicUrl },
      } = supabase.storage.from("hao-duo-zhao-pian").getPublicUrl(data.photo);
      setUrl(publicUrl);
      setError(null);
    }

    getPhoto();
  }, [id]);

  return (
    <div>
      <h1 style={{ textAlign: "center" }}>图片详情{id}</h1>
      {error ? (
        <p>照片不存在</p>
      ) : (
        <img src={url} style={{ width: "100%", height: "300px", objectFit: "contain" }} />
      )}
      <div style={{ marginTop: "20px", display: "flex", justifyContent: "center", gap: "20px" }}>
        <Button
          color="success"
          onClick={() => {
            navigate(`../${Number(id) - 1}`);
          }}
        >
          上一个
        </Button>
        <Button
          color="success"
          onClick={() => {
            navigate(`../${Number(id) + 1}`);
          }}
        >
          下一个
        </Button>
      </div>

      <section>
        <h2 style={{ marginBottom: "20px" }}>评论区</h2>
        <div>
          <div style={{ fontWeight: 600 }}>小蛋嘤嘤嘤</div>
          <p style={{ marginLeft: "30px" }}>这个小蛋好漂亮</p>
          <div style={{ textAlign: "end" }}>2020-2-10</div>
        </div>
      </section>
    </div>
  );
}

export default Page;
