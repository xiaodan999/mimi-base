import React from 'react';
import { createBrowserRouter, Outlet, RouterProvider } from 'react-router-dom';

import NavButtons from './components/NavButtons';

import MimiBase from './components/MimiBase';
import Photos from './components/Photos';
import XiaodanTab from './components/XiaodanTab';
import XiaohaiTab from './components/XiaohaiTab';
import Login from './components/Login';
import Signup from './components/Signup';
import JiZhang from './components/JiZhang';
import RequireAuth from './components/RequireAuth';

const router = createBrowserRouter([
  {
    path: '/',
    element: <RequireAuth />,
    children: [
      {
        element: <Layout />,
        children: [
          {
            path: 'xiaohaibase',
            element: <XiaohaiTab />,
          },
          {
            path: 'photos',
            element: <Photos />,
          },
          {
            path: 'xiaodanbase',
            element: <XiaodanTab />,
          },
          {
            index: true,
            element: <MimiBase />,
          },
        ],
      },
      {
        path: '/jizhang',
        element: <JiZhang />,
      },
    ],
  },
  {
    path: '/login',
    element: <Login />,
  },
  {
    path: '/signup',
    element: <Signup />,
  },
]);

function Layout() {
  return (
    <div
      style={{
        paddingBottom: '45px',
        height: '100%',
      }}
    >
      <Outlet />
      <NavButtons />
    </div>
  );
}

export default function App() {
  return <RouterProvider router={router} />;
}
