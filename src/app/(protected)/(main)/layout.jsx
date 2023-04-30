import React from "react";
import { Outlet } from "react-router-dom";

function Layout() {
  return (
    <div>
      main
      <Outlet />
      <div>4 nav bar</div>
    </div>
  );
}

export default Layout;
