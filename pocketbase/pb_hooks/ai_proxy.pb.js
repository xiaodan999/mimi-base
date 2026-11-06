/// <reference path="../pb_data/types.d.ts" />

/**
 * OpenCode Go 的浏览器中转。
 *
 * OpenCode Go 官方接口不返回 CORS 头，浏览器直连会被拦。这个路由把
 * OpenAI 兼容的 chat completions 请求转发过去，让前端可以通过 PocketBase
 * 调用。API Key 只从请求头透传，不写数据库、不打印日志。
 *
 * 安全约束（相对旧版）：
 *  - 必须是已登录的 PocketBase 用户（@request.auth）才能用，不再是谁都能打的开放中继；
 *  - 限制请求体大小、缩短上游超时、按用户做简单限流；
 *  - 上游异常只回泛化文案，不把原始 err / 密钥串回客户端。
 *
 * 头约定（需要前端一起配合，见任务报告的 NEEDS INTEGRATION PASS）：
 *  - Authorization: <pb.authStore.token>   —— PB 认证令牌（原始值，不带 Bearer）；
 *  - x-opencode-key: <OpenCode Key>       —— 仅透传给上游，绝不回退到 Authorization，
 *    否则会把 PB 令牌误发给 opencode.ai。
 *
 * 注意：JSVM 的 router handler 里拿不到本文件顶层的辅助函数/常量，
 * 所以常量、限流状态、工具函数、全部逻辑都写在 handler 内部。
 */

routerAdd("POST", "/api/ai/opencode/v1/chat/completions", (c) => {
    // ---- 可调参数（都放在 handler 内，顶层常量在此不可见） ----
    const MAX_BODY_BYTES = 4 * 1024 * 1024; // 4 MiB，足够 1024px 视觉请求的 base64
    const UPSTREAM_TIMEOUT = 60; // 秒，从旧的 120 缩短，减少 worker 占用
    const RATE_WINDOW_MS = 60 * 1000; // 固定 60 秒窗口
    const RATE_MAX = 20; // 每窗口每用户最多 20 次

    const info = c.requestInfo();

    // 取请求头（首个值），大小写与连字符都不敏感。
    // 注意：PocketBase 的 requestInfo().headers 会把头名统一成「小写 + 下划线」
    // （`x-opencode-key` → `x_opencode_key`，`Content-Type` → `content_type`），
    // 所以比较前必须把 `-` 也归一成 `_`，否则永远取不到这些头。
    const normalizeHeaderName = (name) =>
        String(name).toLowerCase().replace(/-/g, "_");
    const headerValue = (name) => {
        const target = normalizeHeaderName(name);
        for (const key in info.headers) {
            if (normalizeHeaderName(key) !== target) continue;
            const value = info.headers[key];
            const first = Array.isArray(value) ? value[0] : value;
            return first == null ? "" : String(first);
        }
        return "";
    };

    // ---- 1) PocketBase 认证（@request.auth） ----
    // info.auth 即 @request.auth，由 PocketBase 从 Authorization 里的 PB 令牌解析；
    // 同时兼容 echo 上下文里的 authRecord / RequestEvent.auth，防止不同版本取不到。
    let authRecord = info.auth;
    if (!authRecord) authRecord = c.get("authRecord");
    if (!authRecord) authRecord = c.auth;
    if (!authRecord) {
        return c.json(401, {
            error: { message: "需要登录后才能使用 AI 中转" },
        });
    }
    let uid = authRecord.id ? String(authRecord.id) : "";
    if (!uid && typeof authRecord.getString === "function") {
        uid = authRecord.getString("id") || "";
    }

    // ---- 2) 请求体大小 / 形状 ----
    // Content-Length 优先，序列化长度兜底（chunked 无 Content-Length 时）。
    // PocketBase 自身也有默认上限，这里再按业务收紧一道。
    const contentLength = parseInt(headerValue("content-length"), 10) || 0;
    const body = info.body || {};
    let serialized = "";
    try {
        serialized = JSON.stringify(body);
    } catch (_e) {
        serialized = "";
    }
    if (
        contentLength > MAX_BODY_BYTES ||
        serialized.length > MAX_BODY_BYTES ||
        typeof body !== "object" ||
        Array.isArray(body)
    ) {
        return c.json(413, {
            error: { message: "请求体过大或格式不正确" },
        });
    }

    // ---- 3) 每用户 / IP 限流 ----
    // 用 $app.store()（Go 侧运行时存储，进程内持久、跨 JSVM worker 共享），
    // 比顶层 Map 更稳；只有 PocketBase 整体重启才会清空。这是尽力而为的
    // 固定窗口计数（get+set 非严格原子），足以挡住刷接口，不追求精确配额。
    const callerId = uid || c.realIP() || "anon";
    const rlKey = "mimi:aiRelay:rate:" + callerId;
    let limited = false;
    try {
        const now = Date.now();
        const store = $app.store();
        const raw = store.get(rlKey);
        let rec = { count: 0, resetAt: now + RATE_WINDOW_MS };
        if (raw) {
            try {
                const parsed = JSON.parse(raw);
                if (
                    parsed &&
                    typeof parsed.resetAt === "number" &&
                    now < parsed.resetAt
                ) {
                    rec = parsed;
                }
            } catch (_e) {
                // 坏数据按新窗口处理
            }
        }
        if (rec.count >= RATE_MAX) {
            limited = true;
        } else {
            rec.count += 1;
            store.set(rlKey, JSON.stringify(rec));
        }
    } catch (_e) {
        // 存储不可用时不要让限流把请求打死，记一条日志后放行。
        console.error("ai_proxy: 限流存储不可用，已跳过本次限流");
    }
    if (limited) {
        return c.json(429, {
            error: { message: "请求过于频繁，请稍后再试" },
        });
    }

    // ---- 4) 取出 OpenCode 凭据 ----
    let apiKey = headerValue("x-opencode-key") || headerValue("x-api-key");
    if (!apiKey) {
        return c.json(401, {
            error: { message: "缺少 OpenCode API Key" },
        });
    }
    if (!/^bearer\s/i.test(apiKey)) {
        apiKey = "Bearer " + apiKey;
    }
    let session = headerValue("x-opencode-session");
    if (!session) session = "mimi-base";

    // ---- 5) 转发到固定的上游（非任意 host，无 SSRF） ----
    let res;
    try {
        res = $http.send({
            url: "https://opencode.ai/zen/go/v1/chat/completions",
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: apiKey,
                "x-opencode-session": session,
                "X-Client": "mimi-base/1.0",
            },
            body: serialized,
            timeout: UPSTREAM_TIMEOUT,
        });
    } catch (_e) {
        // 不把上游原始错误串回给客户端（可能含内网/密钥信息），只留泛化文案。
        console.error("ai_proxy: 上游请求失败（细节已对客户端隐藏）");
        return c.json(502, {
            error: { message: "AI 中转暂时不可用，请稍后再试" },
        });
    }

    let contentType = "application/json";
    for (const key in res.headers) {
        if (String(key).toLowerCase() !== "content-type") continue;
        const value = res.headers[key];
        contentType = Array.isArray(value) ? value[0] : value;
        break;
    }

    // ---- 6) 响应 ----
    // 关于流式：JSVM 的 $http.send 会把上游响应整体读进内存，返回体是
    // body: Array<number>（完整字节），它不暴露可交给 c.stream 的 io.Reader，
    // 也没有逐块回调；c.stream(status, contentType, io.Reader) 虽然存在，
    // 但拿不到流式 reader，喂给它也只是把已缓冲的字节一次性写出，并非真正的
    // SSE 增量转发。因此这里明确做不到真流式：kind:"stream" 任务只能拿到
    // 一次性缓冲后的完整响应，Content-Type 仍按上游原样返回，前端的 SSE 解析器
    // 据此把整段文本解析出来，但不会逐字增量显示。为降低 worker 占用，超时
    // 已从 120s 降到 60s。
    return c.blob(res.statusCode, contentType, res.body);
});
