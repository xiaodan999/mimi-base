import React, { useEffect } from "react";
import { Button } from "antd-mobile";
import { Navigate, useNavigate } from "react-router-dom";

import LoadingPage from "../components/LoadingPage";

function Page() {
  const navigate = useNavigate();

  return (
    <div>
      <h1>秘密基地</h1>
      <p>这是一个任何人都可以访问的页面, 无需登入就可以访问哦</p>
      <Button onClick={() => navigate("/login")}>登录</Button>
    </div>
  );
}

export default Page;
