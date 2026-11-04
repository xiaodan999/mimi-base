/// <reference path="../pb_data/types.d.ts" />

/**
 * OpenCode Go 的浏览器中转。
 *
 * OpenCode Go 官方接口不返回 CORS 头，浏览器直连会被拦。这个路由把
 * OpenAI 兼容的 chat completions 请求原样转发过去，让前端可以通过
 * PocketBase 调用。
 *
 * API Key 只从请求头透传，不写数据库、不打印日志。
 *
 * 注意：JSVM 的 router handler 里拿不到本文件顶层的辅助函数/常量，
 * 所以所有逻辑都写在 handler 内部。
 */

routerAdd("POST", "/api/ai/opencode/v1/chat/completions", (c) => {
    const info = c.requestInfo();

    let auth = "";
    let session = "";
    for (const key in info.headers) {
        const normalized = String(key).toLowerCase().replace(/[_-]/g, "");
        const value = info.headers[key];
        const first = Array.isArray(value) ? value[0] : value;
        const text = first == null ? "" : String(first);
        if (normalized === "authorization") auth = text;
        if (normalized === "xopencodesession") session = text;
    }

    if (!auth) {
        return c.json(401, {
            error: { message: "Missing API key" },
        });
    }
    if (!session) session = "mimi-base";

    let res;
    try {
        res = $http.send({
            url: "https://opencode.ai/zen/go/v1/chat/completions",
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: auth,
                "x-opencode-session": session,
                "X-Client": "mimi-base/1.0",
            },
            body: JSON.stringify(info.body || {}),
            timeout: 120,
        });
    } catch (err) {
        return c.json(502, {
            error: { message: "OpenCode Go 中转失败：" + err },
        });
    }

    let contentType = "application/json";
    for (const key in res.headers) {
        if (String(key).toLowerCase() !== "content-type") continue;
        const value = res.headers[key];
        contentType = Array.isArray(value) ? value[0] : value;
        break;
    }

    return c.blob(res.statusCode, contentType, res.body);
});
