/* eslint-disable import/order */
// auto-generated file
import Page1 from "./app/page.jsx";
import Page2 from "./app/(auth)/(protected)/(main)/chat/page.jsx";
import Page3 from "./app/(auth)/(protected)/(main)/home/page.jsx";
import Page4 from "./app/(auth)/(protected)/(main)/jizhang/page.jsx";
import Page6 from "./app/(auth)/(protected)/photo/[id]/page.jsx";
import Page7 from "./app/(auth)/login/page.jsx";
import Page8 from "./app/(auth)/logout/page.jsx";
import Page9 from "./app/(auth)/signup/page.jsx";
import Page10 from "./app/examples/page.jsx";
import Page12 from "./app/examples/dynamic-routes/page.jsx";
import Page13 from "./app/examples/dynamic-routes/[id]/page.jsx";
import Page14 from "./app/examples/independent-routes/page.jsx";
import Page15 from "./app/examples/independent-routes/abc/page.jsx";
import Page16 from "./app/examples/independent-routes/awesome/page.jsx";
import Page17 from "./app/examples/nested-routes/page.jsx";
import Page18 from "./app/examples/nested-routes/hello/page.jsx";
import Page19 from "./app/examples/nested-routes/id/page.jsx";
import Layout1 from "./app/layout.jsx";
import Layout2 from "./app/(auth)/layout.jsx";
import Layout3 from "./app/(auth)/(protected)/layout.jsx";
import Layout4 from "./app/(auth)/(protected)/(main)/layout.jsx";
import Layout6 from "./app/(auth)/(protected)/photo/layout.jsx";
import Layout7 from "./app/examples/layout.jsx";
import Layout8 from "./app/examples/dynamic-routes/layout.jsx";
import Layout9 from "./app/examples/independent-routes/layout.jsx";

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
                element: <Layout4 />,
                children: [
                  {
                    path: "/chat",
                    element: <Page2 />,
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
                    lazy: async () => ({
                      Component: (await import("./app/(auth)/(protected)/(main)/photos/layout.jsx"))
                        .default,
                    }),
                    children: [
                      {
                        index: true,
                        lazy: async () => ({
                          Component: (
                            await import("./app/(auth)/(protected)/(main)/photos/page.jsx")
                          ).default,
                        }),
                      },
                    ],
                  },
                ],
              },
              {
                element: <Layout6 />,
                children: [
                  {
                    path: "/photo/:id",
                    element: <Page6 />,
                  },
                ],
              },
            ],
          },
          {
            path: "/login",
            element: <Page7 />,
          },
          {
            path: "/logout",
            element: <Page8 />,
          },
          {
            path: "/signup",
            element: <Page9 />,
          },
        ],
      },
      {
        path: "/examples",
        element: <Layout7 />,
        children: [
          {
            index: true,
            element: <Page10 />,
          },
          {
            path: "/examples/chart-test",
            lazy: async () => ({
              Component: (await import("./app/examples/chart-test/page.jsx")).default,
            }),
          },
          {
            path: "/examples/dynamic-routes",
            element: <Layout8 />,
            children: [
              {
                index: true,
                element: <Page12 />,
              },
              {
                path: "/examples/dynamic-routes/:id",
                element: <Page13 />,
              },
            ],
          },
          {
            path: "/examples/independent-routes",
            element: <Layout9 />,
            children: [
              {
                index: true,
                element: <Page14 />,
              },
              {
                path: "/examples/independent-routes/abc",
                element: <Page15 />,
              },
              {
                path: "/examples/independent-routes/awesome",
                element: <Page16 />,
              },
            ],
          },
          {
            path: "/examples/nested-routes",
            element: <Page17 />,
            children: [
              {
                path: "/examples/nested-routes/hello",
                element: <Page18 />,
              },
              {
                path: "/examples/nested-routes/id",
                element: <Page19 />,
              },
            ],
          },
        ],
      },
    ],
  },
];

export default routes;
