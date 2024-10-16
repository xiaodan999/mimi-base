import { useNavigate } from "react-router-dom";
import { AutoCenter, Button } from "antd-mobile";

import Logo from "./logo512.png";
import { useEffect } from "react";

function Page() {
  const navigate = useNavigate();
  useEffect(() => {
    navigate();
  }, []);

  return (
    <div style={{ height: "100%", padding: "1rem", display: "flex", flexDirection: "column" }}>
      <AutoCenter>
        <h1 style={{ marginBottom: "1rem" }}>秘密基地</h1>
      </AutoCenter>
      <AutoCenter>
        <img src={Logo} title="logo" alt="logo" width="300px" height="300px" />
      </AutoCenter>

      <AutoCenter>
        <p>这是一个任何人都可以访问的页面, 无需登入就可以访问哦</p>
      </AutoCenter>
      <div style={{ flex: 1, display: "flex", justifyContent: "center", alignItems: "center" }}>
        <Button color="primary" size="large" onClick={() => navigate("/home")}>
          进入秘密基地
        </Button>
      </div>
    </div>
  );
}

export default Page;
