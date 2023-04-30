import React from "react";
import { Link } from "react-router-dom";
import { useUser } from "../../../../../contexts/AuthContext";

function Page() {
  const [user] = useUser();

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
    </div>
  );
}
export default Page;
