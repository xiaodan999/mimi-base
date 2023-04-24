import { useEffect, useState } from "react";
import supabase from "../../supabase-client/supabase";
import XiaohaiTab from "../XiaohaiTab";
export default function XiaodanTab() {
  const [name, setName] = useState("");
  const [mimi, setMimi] = useState("");
  const [submitting, setSubmitting] = useState(false);
  useEffect(() => {
    async function loadName() {
      let { data } = await supabase.from("users").select("user_name").single();
      setName(data.user_name);
    }
    loadName();
  }, []);
  return (
    <div
      style={{
        padding: "0 10px",
        height: "100%",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <section>
        <h1 style={{ textAlign: "center" }}>小蛋專屬頁😁</h1>
        <p>我是一個小啊蛋~~蛋蛋蛋蛋蛋🥚</p>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            marginBottom: "10px",
          }}
        >
          <p
            style={{
              width: "45px",
              marginRight: "10px",
              marginTop: 0,
              marginBottom: 0,
            }}
          >
            Name:
          </p>
          <input value={name} type="text" disabled />
        </div>
        <div style={{ display: "flex", alignItems: "center" }}>
          <p
            style={{
              marginRight: "10px",
              marginTop: 0,
              marginBottom: 0,
              whiteSpace: "nowrap",
            }}
          >
            秘密:
          </p>
          <textarea
            value={mimi}
            onChange={(e) => {
              setMimi(e.target.value);
            }}
            cols={60}
          ></textarea>
        </div>

        <button
          disabled={mimi.length === 0 || /^ *$/.test(mimi) || submitting}
          onClick={async () => {
            setSubmitting(true);
            await supabase.from("mmi").insert([{ person_name: name, mimi: mimi }]);
            setMimi("");
            setSubmitting(false);
          }}
          style={{
            marginTop: "20px",
            width: "120px",
            padding: "12px",
            borderRadius: "10px",
            fontSize: "16px",
          }}
        >
          添加秘密 {submitting ? "..." : ""}
        </button>
      </section>
      <section style={{ overflow: "hidden" }}>
        <XiaohaiTab />
      </section>
    </div>
  );
}
