// auto-generated file
import Page1 from "./app/page.jsx";
import Page2 from "./app/(protected)/(main)/chat/page.jsx";
import Page3 from "./app/(protected)/(main)/home/page.jsx";
import Page4 from "./app/(protected)/(main)/jizhang/page.jsx";
import Page5 from "./app/(protected)/(main)/photos/page.jsx";
import Page6 from "./app/login/page.jsx";
import Page7 from "./app/signup/page.jsx";
import Layout1 from "./app/layout.jsx";
import Layout2 from "./app/(protected)/layout.jsx";
import Layout3 from "./app/(protected)/(main)/layout.jsx";

const routes = [
  {
    element: <Layout1 />,
    children: [
      {
        path: "/",
        element: <Page1 />,
      },
      {
        element: <Layout2 />,
        children: [
          {
            element: <Layout3 />,
            children: [
              {
                path: "/chat",
                lazy: async () => ({
                  Component: (await import("./app/(protected)/(main)/chat/page.jsx")).default,
                }),
              },
              {
                path: "/home",
                element: <Page3 />,
              },
              {
                path: "/jizhang",
                element: <Page4 />,
              },
              {
                path: "/photos",
                element: <Page5 />,
              },
            ],
          },
        ],
      },
      {
        path: "/login",
        element: <Page6 />,
      },
      {
        path: "/signup",
        element: <Page7 />,
      },
    ],
  },
];

export default routes;
