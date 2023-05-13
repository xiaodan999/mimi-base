import { useState } from "react";
import { AutoCenter, Button, TextArea } from "antd-mobile";

import XiaohaiTab from "@src/components/XiaohaiTab";
import { useUser } from "@src/contexts/AuthContext";
import supabase from "@src/supabase-client/supabase";

import styles from "./page.module.css";

export default function Page() {
  const [user] = useUser();
  const [mimi, setMimi] = useState("");
  const [submitting, setSubmitting] = useState(false);

  return (
    <div className={styles.page}>
      <AutoCenter>
        <h1>聊天基地</h1>
      </AutoCenter>
      <section className={styles.messages}>
        <XiaohaiTab />
      </section>
      <div className={styles.textInput}>
        <div className={styles.wrapper}>
          <TextArea
            style={{
              backgroundColor: "var(--accent-color)",
              "--placeholder-color": "var(--text-color)",
            }}
            placeholder="请输入内容"
            value={mimi}
            onChange={(value) => {
              setMimi(value);
            }}
            cols={60}
          />
        </div>
        <Button
          className={styles.button}
          shape="rounded"
          color="success"
          loading={submitting}
          disabled={mimi.length === 0 || /^ *$/.test(mimi) || submitting}
          onClick={async () => {
            setSubmitting(true);
            await supabase.from("mmi").insert([{ person_name: user.user_name, mimi: mimi }]);
            setMimi("");
            setSubmitting(false);
          }}
        >
          添加
        </Button>
      </div>
    </div>
  );
}
