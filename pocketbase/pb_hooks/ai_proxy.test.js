// 独立测试：这不是 PocketBase hook（引擎只加载 *.pb.js），*.test.js 不会被
// PocketBase 自动加载；即便被误加载，下面的 typeof Bun 判断也会让 require
// 全部跳过，保持无害。
//
// 用假路由/假上下文执行 ai_proxy.pb.js，锁住线上坏过的那条路径：
// PocketBase 的 requestInfo().headers 把头名统一成「小写 + 下划线」
// （x-opencode-key → x_opencode_key），中转取头时必须把 `-` 也归一成 `_`。
// 只做归一化必然导致 401「缺少 OpenCode API Key」。
//
//     bun test pocketbase/pb_hooks/ai_proxy.test.js

if (typeof Bun !== "undefined") {
    const { test, expect } = require("bun:test");
    const fs = require("node:fs");
    const path = require("node:path");

    const SOURCE = fs.readFileSync(
        path.join(__dirname, "ai_proxy.pb.js"),
        "utf8",
    );

    /** 加载 hook 文件，拿到注册的路由处理函数。 */
    function loadHandler(httpSend) {
        let handler = null;
        const routerAdd = (_method, _route, fn) => {
            handler = fn;
        };
        const $app = {
            store: () => ({ get: () => undefined, set: () => {} }),
        };
        const $http = { send: httpSend };
        new Function("routerAdd", "$app", "$http", "console", SOURCE)(
            routerAdd,
            $app,
            $http,
            {
                log: () => {},
                error: () => {},
            },
        );
        expect(typeof handler).toBe("function");
        return handler;
    }

    function makeContext(headers, body, auth) {
        return {
            requestInfo: () => ({ headers, body, auth }),
            get: () => null,
            realIP: () => "127.0.0.1",
            json: (status, payload) => ({ kind: "json", status, payload }),
            blob: (status, contentType, body) => ({
                kind: "blob",
                status,
                contentType,
                body,
            }),
        };
    }

    const body = {
        model: "deepseek-v4.1-flash",
        messages: [{ role: "user", content: "hi" }],
    };

    function okResponse() {
        return {
            statusCode: 200,
            headers: { "Content-Type": ["application/json"] },
            body: [123, 125],
        };
    }

    test("PB 下划线头名：x_opencode_key 能取到并转给上游", () => {
        const calls = [];
        const handler = loadHandler((req) => {
            calls.push(req);
            return okResponse();
        });

        const res = handler(
            makeContext(
                {
                    authorization: "pb-token",
                    x_opencode_key: "oc_sk_test",
                    x_opencode_session: "sess-1",
                },
                body,
                { id: "u1" },
            ),
        );

        expect(res.status).toBe(200);
        expect(calls).toHaveLength(1);
        expect(calls[0].url).toBe(
            "https://opencode.ai/zen/go/v1/chat/completions",
        );
        // BYOK key 走 Authorization 发给上游，PB 令牌绝不外泄。
        expect(calls[0].headers.Authorization).toBe("Bearer oc_sk_test");
        expect(calls[0].headers["x-opencode-session"]).toBe("sess-1");
        expect(JSON.parse(calls[0].body)).toEqual(body);
    });

    test("连字符头名同样能取到（浏览器/代理原样透传时）", () => {
        const calls = [];
        const handler = loadHandler((req) => {
            calls.push(req);
            return okResponse();
        });

        handler(
            makeContext(
                {
                    "X-Opencode-Key": "oc_sk_dash",
                    "x-opencode-session": "sess-2",
                },
                body,
                { id: "u1" },
            ),
        );

        expect(calls[0].headers.Authorization).toBe("Bearer oc_sk_dash");
        expect(calls[0].headers["x-opencode-session"]).toBe("sess-2");
    });

    test("没有 key 时 401，且不请求上游", () => {
        let called = false;
        const handler = loadHandler(() => {
            called = true;
            return okResponse();
        });

        const res = handler(makeContext({}, body, { id: "u1" }));

        expect(res.status).toBe(401);
        expect(res.payload.error.message).toContain("OpenCode API Key");
        expect(called).toBe(false);
    });

    test("未登录时 401，先于 key 校验", () => {
        const handler = loadHandler(() => okResponse());
        const res = handler(
            makeContext({ x_opencode_key: "oc_sk_test" }, body, null),
        );

        expect(res.status).toBe(401);
        expect(res.payload.error.message).toContain("登录");
    });
}
