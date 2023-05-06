import { useState } from "react";
import { Button } from "antd-mobile";

import XiaohaiTab from "@src/components/XiaohaiTab";
import { useUser } from "@src/contexts/AuthContext";
import supabase from "@src/supabase-client/supabase";

export default function Page() {
  const [user] = useUser();
  const [mimi, setMimi] = useState("");
  const [submitting, setSubmitting] = useState(false);

  return (
    <div
      style={{
        padding: "0 10px",
        height: "100%",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <h1 style={{ fontSize: "32px", textAlign: "center", marginTop: "10px", marginBottom: "5px" }}>
        聊天基地
      </h1>
      <section style={{ overflow: "hidden", flex: 1 }}>
        <XiaohaiTab />
      </section>
      <div style={{ display: "flex", alignItems: "center" }}>
        <textarea
          placeholder="请输入内容"
          value={mimi}
          onChange={(e) => {
            setMimi(e.target.value);
          }}
          cols={60}
        ></textarea>
        <Button
          color="success"
          disabled={mimi.length === 0 || /^ *$/.test(mimi) || submitting}
          onClick={async () => {
            setSubmitting(true);
            await supabase.from("mmi").insert([{ person_name: user.user_name, mimi: mimi }]);
            setMimi("");
            setSubmitting(false);
          }}
          style={{
            width: "120px",
            padding: "10px",
            borderRadius: "10px",
            fontSize: "14px",
          }}
        >
          添加 {submitting ? "..." : ""}
        </Button>
      </div>
    </div>
  );
}
