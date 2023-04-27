import React from "react";
import { createBrowserRouter, Outlet, RouterProvider } from "react-router-dom";

import Layout from "./components/Layout";
import Login from "./components/Login";
import Signup from "./components/Signup";
import RequireAuth from "./components/RequireAuth";
import { AuthProvider } from "./contexts/AuthContext";

const router = createBrowserRouter([
  {
    element: (
      <AuthProvider>
        <Outlet />
      </AuthProvider>
    ),
    children: [
      {
        path: "/",
        element: <RequireAuth />,
        children: [
          {
            element: <Layout />,
            children: [
              {
                path: "xiaohaibase",
                lazy: async () => ({
                  Component: (await import("./components/XiaohaiTab")).default,
                }),
              },
              {
                path: "photos",
                lazy: async () => ({
                  Component: (await import("./components/Photos")).default,
                }),
              },
              {
                path: "xiaodanbase",
                lazy: async () => ({
                  Component: (await import("./components/XiaodanTab")).default,
                }),
              },
              {
                index: true,
                lazy: async () => ({
                  Component: (await import("./components/MimiBase")).default,
                }),
              },
            ],
          },
          {
            path: "jizhang",
            lazy: async () => ({
              Component: (await import("./components/JiZhang")).default,
            }),
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
        lazy: async () => ({
          Component: (await import("./components/Logout")).default,
        }),
      },
    ],
  },
]);

export default function App() {
  return <RouterProvider router={router} />;
}
