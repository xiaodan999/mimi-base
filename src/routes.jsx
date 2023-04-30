// auto-generated file

const routes = [
  {
    path: "/",
    lazy: async () => ({ Component: (await import("./app/layout.jsx")).default }),
    children: [
      {
        index: true,
        lazy: async () => ({ Component: (await import("./app/page.jsx")).default }),
      },
      {
        lazy: async () => ({ Component: (await import("./app/(auth)/layout.jsx")).default }),
        children: [
          {
            lazy: async () => ({
              Component: (await import("./app/(auth)/(protected)/layout.jsx")).default,
            }),
            children: [
              {
                lazy: async () => ({
                  Component: (await import("./app/(auth)/(protected)/(main)/layout.jsx")).default,
                }),
                children: [
                  {
                    path: "/chat",
                    lazy: async () => ({
                      Component: (await import("./app/(auth)/(protected)/(main)/chat/page.jsx"))
                        .default,
                    }),
                  },
                  {
                    path: "/home",
                    lazy: async () => ({
                      Component: (await import("./app/(auth)/(protected)/(main)/home/page.jsx"))
                        .default,
                    }),
                  },
                  {
                    path: "/jizhang",
                    lazy: async () => ({
                      Component: (await import("./app/(auth)/(protected)/(main)/jizhang/page.jsx"))
                        .default,
                    }),
                  },
                  {
                    path: "/photos",
                    lazy: async () => ({
                      Component: (await import("./app/(auth)/(protected)/(main)/photos/page.jsx"))
                        .default,
                    }),
                  },
                ],
              },
            ],
          },
          {
            path: "/login",
            lazy: async () => ({
              Component: (await import("./app/(auth)/login/page.jsx")).default,
            }),
          },
          {
            path: "/logout",
            lazy: async () => ({
              Component: (await import("./app/(auth)/logout/page.jsx")).default,
            }),
          },
          {
            path: "/signup",
            lazy: async () => ({
              Component: (await import("./app/(auth)/signup/page.jsx")).default,
            }),
          },
        ],
      },
      {
        path: "/examples",
        lazy: async () => ({ Component: (await import("./app/examples/layout.jsx")).default }),
        children: [
          {
            index: true,
            lazy: async () => ({ Component: (await import("./app/examples/page.jsx")).default }),
          },
          {
            path: "/examples/dynamic-routes",
            lazy: async () => ({
              Component: (await import("./app/examples/dynamic-routes/layout.jsx")).default,
            }),
            children: [
              {
                index: true,
                lazy: async () => ({
                  Component: (await import("./app/examples/dynamic-routes/page.jsx")).default,
                }),
              },
              {
                path: "/examples/dynamic-routes/:id",
                lazy: async () => ({
                  Component: (await import("./app/examples/dynamic-routes/[id]/page.jsx")).default,
                }),
              },
            ],
          },
          {
            path: "/examples/independent-routes",
            lazy: async () => ({
              Component: (await import("./app/examples/independent-routes/layout.jsx")).default,
            }),
            children: [
              {
                index: true,
                lazy: async () => ({
                  Component: (await import("./app/examples/independent-routes/page.jsx")).default,
                }),
              },
              {
                path: "/examples/independent-routes/abc",
                lazy: async () => ({
                  Component: (await import("./app/examples/independent-routes/abc/page.jsx"))
                    .default,
                }),
              },
              {
                path: "/examples/independent-routes/awesome",
                lazy: async () => ({
                  Component: (await import("./app/examples/independent-routes/awesome/page.jsx"))
                    .default,
                }),
              },
            ],
          },
          {
            path: "/examples/nested-routes",
            lazy: async () => ({
              Component: (await import("./app/examples/nested-routes/page.jsx")).default,
            }),
            children: [
              {
                path: "/examples/nested-routes/hello",
                lazy: async () => ({
                  Component: (await import("./app/examples/nested-routes/hello/page.jsx")).default,
                }),
              },
              {
                path: "/examples/nested-routes/id",
                lazy: async () => ({
                  Component: (await import("./app/examples/nested-routes/id/page.jsx")).default,
                }),
              },
            ],
          },
        ],
      },
    ],
  },
];

export default routes;
