import React, { lazy, Suspense } from "react";
import { createBrowserRouter, Outlet, RouterProvider } from "react-router-dom";

import Layout from "./components/Layout";
import Login from "./components/Login";
import Signup from "./components/Signup";
import RequireAuth from "./components/RequireAuth";
import { AuthProvider } from "./contexts/AuthContext";
import { CenterSpinner } from "./components/Spinner";

const MimiBase = lazy(() => import("./components/MimiBase"));
const Photos = lazy(() => import("./components/Photos"));
const XiaodanTab = lazy(() => import("./components/XiaodanTab"));
const XiaohaiTab = lazy(() => import("./components/XiaohaiTab"));
const JiZhang = lazy(() => import("./components/JiZhang"));
const Logout = lazy(() => import("./components/Logout"));

const router = createBrowserRouter([
  {
    path: "/",
    element: (
      <AuthProvider>
        <Outlet />
      </AuthProvider>
    ),
    children: [
      {
        element: <RequireAuth />,
        children: [
          {
            element: <Layout />,
            children: [
              {
                path: "xiaohaibase",
                element: <XiaohaiTab />,
              },
              {
                path: "photos",
                element: <Photos />,
              },
              {
                path: "xiaodanbase",
                element: <XiaodanTab />,
              },
              {
                index: true,
                element: <MimiBase />,
              },
            ],
          },
          {
            path: "/jizhang",
            element: <JiZhang />,
          },
        ],
      },
      {
        path: "/login",
        element: <Login />,
      },
      {
        path: "/signup",
        element: <Signup />,
      },
      {
        path: "/logout",
        element: <Logout />,
      },
    ],
  },
]);

export default function App() {
  return (
    <Suspense fallback={<CenterSpinner />}>
      <RouterProvider router={router} />
    </Suspense>
  );
}
