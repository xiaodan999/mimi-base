import React from "react";
import { Outlet } from "react-router-dom";

function Layout() {
  return (
    <div>
      <h1>'/independent-routes' 's layout</h1>
      we can simply return {"<Outlet />"} in the layout.jsx to achieve independent routes
      <p>The index route is also independent</p>
      <div style={{ marginTop: "40px" }} />
      <Outlet />
    </div>
  );
}

export default Layout;
