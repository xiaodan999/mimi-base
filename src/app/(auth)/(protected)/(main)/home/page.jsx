import { useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "antd-mobile";

import TouXiang from "@src/components/TouXiang";
import { useUser } from "@src/contexts/AuthContext";

const DINNER = [
  { name: "螺蛳粉" },
  { name: "塔斯丁" },
  { name: "肯德基" },
  { name: "酸菜鱼" },
  { name: "方便面" },
  { name: "煮饭" },
  { name: "烤鸡腿" },
  { name: "沙县小吃" },
  { name: "面总管" },
  { name: "烧烤" },
  { name: "披萨" },
  { name: "水果" },
  { name: "蔬菜沙拉" },
  { name: "喜姐烤串" },
  { name: "徽派" },
  { name: "奶茶" },
  { name: "咖喱饭" },
  { name: "兰州拉面" },
  { name: "李记麻辣烫" },
  { name: "杨国福麻辣烫" },
  { name: "老北京火锅" },
  { name: "酸辣粉" },
  { name: "小龙虾" },
  { name: "李记一绝臭豆腐" },
  { name: "胖哥俩" },
  { name: "瘦肉丸" },
  { name: "泡泡酸辣粉" },
  { name: "面包" },
];
function Page() {
  const [user] = useUser();
  const [show, setShow] = useState(false);
  const index = Math.floor(Math.random() * DINNER.length - 1);

  return (
    <div style={{ padding: "0 12px" }}>
      <h1 style={{ textAlign: "center", marginBottom: "8px" }}>
        秘密保存基地 <i>V6.0</i>
      </h1>
      <p style={{ fontSize: "28px" }}>
        欢迎{" "}
        <span style={{ fontWeight: 600, fontStyle: "italic", color: "orange" }}>
          {user.user_name}🎉✨🎉✨
        </span>
      </p>
      <p style={{ marginTop: "30px" }}>
        <Link to="/logout">退出登录</Link>
      </p>
      <Button
        onClick={() => {
          setShow(true);
        }}
        block
        size="large"
        style={{
          "--background-color": "var(--accent-color)",
          "--border-color": "var(--border-color)",
        }}
      >
        抽奖环节
      </Button>
      {show ? (
        <p style={{ fontSize: "var(--adm-font-size-10)" }}>
          今天晚餐吃什么：<span style={{ backgroundColor: "Highlight" }}>{DINNER[index].name}</span>{" "}
        </p>
      ) : undefined}
      <div style={{ display: "flex", justifyContent: "center" }}>
        <TouXiang size={100} touXiangUrl={user.tou_xiang} circleUrl={user.circle} />
      </div>
    </div>
  );
}
export default Page;
