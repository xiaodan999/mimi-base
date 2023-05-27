import { useEffect, useState } from "react";
import { AutoCenter, Button, TextArea, Toast } from "antd-mobile";

import XiaohaiTab from "@src/components/XiaohaiTab";
import { useUser } from "@src/contexts/AuthContext";
import supabase from "@src/supabase-client/supabase";

import styles from "./page.module.css";

export default function Page() {
  const [user] = useUser();
  const [mimi, setMimi] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    // subscribe to push messages
    (async () => {
      const permission = await Notification.requestPermission();
      if (permission === "granted") {
        const registration = await navigator.serviceWorker.ready;
        const pushSubscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: import.meta.env.VITE_PUSH_PUBLIC_KEY,
        });
        const { error } = await supabase.from("push-subscriptions").upsert(
          {
            user_id: user.id,
            endpoint: pushSubscription.endpoint,
            subscription: JSON.stringify(pushSubscription),
          },
          { onConflict: "endpoint" },
        );
        if (error) {
          Toast.show({
            icon: "fail",
            content: "订阅消息推送失败. " + error.message,
          });
        }
      }
    })();
  }, []);

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
              borderRadius: "var(--adm-radius-m)",
              padding: "2px",
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
            await supabase.from("mmi").insert([{ mimi: mimi, author_id: user.id }]);
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
