import { useEffect } from "react";
import { useNavigate } from "react-router-dom";

import supabase from "@src/supabase-client/supabase";

function Page() {
  const navigate = useNavigate();

  useEffect(() => {
    supabase.auth.signOut().then(() => {
      console.log("logged out");
      setTimeout(() => {
        navigate("/");
      }, 1000);
    });
  }, [navigate]);

  return (
    <div>
      <h1>退出登录...</h1>
    </div>
  );
}

export default Page;
