import React from "react";
import { Outlet } from "react-router-dom";
import { AuthProvider } from "../../contexts/AuthContext";

function Layout() {
  return (
    <AuthProvider>
      <Outlet />
    </AuthProvider>
  );
}

export default Layout;
