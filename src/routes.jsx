// auto-generated file
import Page1 from "./app/page.jsx";
import Page2 from "./app/(protected)/(main)/chat/page.jsx";
import Page3 from "./app/(protected)/(main)/home/page.jsx";
import Page4 from "./app/(protected)/(main)/jizhang/page.jsx";
import Page5 from "./app/(protected)/(main)/photos/page.jsx";
import Page6 from "./app/examples/page.jsx";
import Page7 from "./app/examples/dynamic-routes/page.jsx";
import Page8 from "./app/examples/dynamic-routes/[id]/page.jsx";
import Page9 from "./app/examples/independent-routes/page.jsx";
import Page10 from "./app/examples/independent-routes/abc/page.jsx";
import Page11 from "./app/examples/independent-routes/awesome/page.jsx";
import Page12 from "./app/examples/nested-routes/page.jsx";
import Page13 from "./app/examples/nested-routes/hello/page.jsx";
import Page14 from "./app/examples/nested-routes/id/page.jsx";
import Page15 from "./app/login/page.jsx";
import Page16 from "./app/logout/page.jsx";
import Page17 from "./app/signup/page.jsx";
import Layout1 from "./app/layout.jsx";
import Layout2 from "./app/(protected)/layout.jsx";
import Layout3 from "./app/(protected)/(main)/layout.jsx";
import Layout4 from "./app/examples/layout.jsx";
import Layout5 from "./app/examples/dynamic-routes/layout.jsx";
import Layout6 from "./app/examples/independent-routes/layout.jsx";

const routes = [
  {
    path: "/",
    element: <Layout1 />,
    children: [
      {
        index: true,
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
        path: "/examples",
        element: <Layout4 />,
        children: [
          {
            index: true,
            element: <Page6 />,
          },
          {
            path: "/examples/dynamic-routes",
            element: <Layout5 />,
            children: [
              {
                index: true,
                element: <Page7 />,
              },
              {
                path: "/examples/dynamic-routes/:id",
                element: <Page8 />,
              },
            ],
          },
          {
            path: "/examples/independent-routes",
            element: <Layout6 />,
            children: [
              {
                index: true,
                element: <Page9 />,
              },
              {
                path: "/examples/independent-routes/abc",
                element: <Page10 />,
              },
              {
                path: "/examples/independent-routes/awesome",
                element: <Page11 />,
              },
            ],
          },
          {
            path: "/examples/nested-routes",
            element: <Page12 />,
            children: [
              {
                path: "/examples/nested-routes/hello",
                element: <Page13 />,
              },
              {
                path: "/examples/nested-routes/id",
                element: <Page14 />,
              },
            ],
          },
        ],
      },
      {
        path: "/login",
        element: <Page15 />,
      },
      {
        path: "/logout",
        element: <Page16 />,
      },
      {
        path: "/signup",
        element: <Page17 />,
      },
    ],
  },
];

export default routes;
