import { Image, List, Toast } from "antd-mobile";
import { AppstoreOutline, RightOutline, UserCircleOutline, UserOutline } from "antd-mobile-icons";

import TouXiang from "@src/components/TouXiang";
import { useUser } from "@src/contexts/AuthContext";
import supabase from "@src/supabase-client/supabase";
import compressImage from "@src/utils/compressImage";
import getResizedUrl from "@src/utils/getResizedUrl";
import showFilePicker from "@src/utils/showFilePicker";

export default function Page() {
  const [user, _, refresh] = useUser();
  return (
    <div>
      <h1 style={{ textAlign: "center", margin: "12px 0" }}>个人资料</h1>
      <List
        style={{
          "--adm-color-background": "var(--accent-color)",
          "--active-background-color": "var(--secondary-color)",
          "--adm-color-border": "var(--border-color)",
        }}
      >
        <List.Item
          title={<>&nbsp;</>}
          description={<>&nbsp;</>}
          prefix={<UserCircleOutline />}
          extra={<TouXiang size={64} touXiangUrl={user.tou_xiang} circleUrl={user.circle} />}
          arrow={<RightOutline style={{ color: "var(--text-color)" }} />}
          onClick={() => {
            showFilePicker("image/*").then(async (file) => {
              const compressed = await compressImage(file, { quality: 1 });

              const path = `${user.id}/${Date.now()}.webp`;
              Toast.show({
                content: "修改头像中",
                icon: "loading",
              });
              const { data, error: storageError } = await supabase.storage
                .from("tou-xiang")
                .upload(path, compressed, { cacheControl: "31536000" });
              if (storageError) {
                Toast.show({
                  content: "上传头像失败",
                  icon: "fail",
                });
                console.error(storageError);
                return;
              }
              const photoUrl = supabase.storage.from("tou-xiang").getPublicUrl(data.path)
                .data.publicUrl;
              await supabase.from("users").update({ tou_xiang: photoUrl }).eq("id", user.id);
              refresh();
            });
          }}
        >
          头像
        </List.Item>
        <List.Item
          prefix={<AppstoreOutline />}
          arrow={<RightOutline style={{ color: "var(--text-color)" }} />}
          extra={
            <Image
              src={getResizedUrl({ url: user.circle, width: 32, height: 32 })}
              width={32}
              height={32}
            />
          }
          onClick={() => {}}
        >
          头像框
        </List.Item>
        <List.Item
          prefix={<UserOutline />}
          extra={user.user_name}
          arrow={<RightOutline style={{ color: "var(--text-color)" }} />}
          onClick={() => {}}
        >
          用户名
        </List.Item>
      </List>
    </div>
  );
}
