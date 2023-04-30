import React from "react";
import { Outlet } from "react-router-dom";

import { AuthProvider } from "../contexts/AuthContext";

// The root layout for the whole app
function Layout() {
  return (
    <div className="root-layout" style={{ height: "100%" }}>
      <AuthProvider>
        <Outlet />
      </AuthProvider>
    </div>
  );
}

export default Layout;
