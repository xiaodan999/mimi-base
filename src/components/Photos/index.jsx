import { Outlet } from "react-router-dom";

export default function Photos() {
  return (
    <div>
      <h1>Photos</h1>
      <img width={300} src="/images/hezhao.jfif" alt="hezhao" />
      <img width={300} src="/images/hezhao.jfif" alt="hezhao" />
      <Outlet />
    </div>
  );
}
