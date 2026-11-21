import { CHART_LEGENDS, CHART_PALETTES } from "@/app/chat/chart";
import type { ChatToolDefinition } from "@/app/chat/stream";
import { UI_SPEC_SCHEMA } from "@/app/chat/ui-spec";

/**
 * Tools the chat model may call. Code runs in the server-side QuickJS sandbox
 * (public HTTP(S) only); data tools hit `/api/ai/tools/*`, where the server
 * enforces auth, scoping and limits — the browser just forwards arguments.
 */
export const SANDBOX_TOOLS: readonly ChatToolDefinition[] = [
    {
        type: "function",
        function: {
            name: "sandbox_run",
            description:
                "在服务器的 QuickJS 沙箱里运行 JavaScript（标准库，没有 Node API、npm 和文件系统）。用 sandbox.read(path)、sandbox.write(path, text)、sandbox.list()、sandbox.remove(path) 读写本次对话的文件；用 sandbox.fetch(url) 读取公网网页/接口（直接返回正文文本，不是 Response 对象，JSON 用 JSON.parse(await sandbox.fetch(url))，不要写 .body/.text()；同一次运行可以多次或并发读取），用 sandbox.download(url, path) 把公网图片下载到沙箱（PNG/JPEG/WebP/GIF，最大 1.5MB）。用 console.log 输出、用 return 返回结果（也可以赋给 result）。沙箱访问不到本站内网、PocketBase 或本站文件/密钥。本轮下载的图片会自动显示给用户，文本文件用 send_file 发送。适合计算、处理文本/JSON、验证代码和查公开网页；不能画图，需要图表时用 show_chart。",
            parameters: {
                type: "object",
                properties: {
                    code: {
                        type: "string",
                        description:
                            "要执行的 JavaScript 源码。用 console.log 输出、return 返回结果。",
                    },
                },
                required: ["code"],
                additionalProperties: false,
            },
        },
    },
    {
        type: "function",
        function: {
            name: "sandbox_read",
            description: "读取本次对话沙箱里的一个文本文件。",
            parameters: {
                type: "object",
                properties: {
                    path: {
                        type: "string",
                        description: "相对路径，例如 notes.md",
                    },
                },
                required: ["path"],
                additionalProperties: false,
            },
        },
    },
    {
        type: "function",
        function: {
            name: "sandbox_write",
            description:
                "把一段文本写入本次对话沙箱里的文件（默认覆盖同名文件）。写很长的文件（如整份 HTML 手册）不要一次写完：先写入第一段，之后每次带 append=true 在文件末尾续写下一段，最后再用 send_file 发送。",
            parameters: {
                type: "object",
                properties: {
                    path: { type: "string", description: "相对路径" },
                    content: {
                        type: "string",
                        description: "这一段的内容；append=false 时是完整内容",
                    },
                    append: {
                        type: "boolean",
                        description:
                            "true 时在文件末尾续写而不是覆盖（分多次写长文件用）",
                    },
                },
                required: ["path", "content"],
                additionalProperties: false,
            },
        },
    },
    {
        type: "function",
        function: {
            name: "sandbox_list",
            description: "列出本次对话沙箱里的文件路径。",
            parameters: {
                type: "object",
                properties: {},
                additionalProperties: false,
            },
        },
    },
    {
        type: "function",
        function: {
            name: "send_file",
            description:
                "把本次对话沙箱里的文本文件发送给用户，聊天里会显示成可预览、可下载的卡片。支持 HTML、Markdown、CSV、JSON、SVG、TXT 和代码文件；文件必须已经用 sandbox_write 或 sandbox_run 写进沙箱。用户说「发给我」「给我看看那个文件」时使用。图片会在生成时自动显示，不需要调用它。卡片显示在调用位置：调用之后你补写的文字都排在卡片下面，所以想先说明后卡片，就在同一条回复里先写完说明再调用；已经调用了，之后就不要再说「文件在下面」。",
            parameters: {
                type: "object",
                properties: {
                    path: {
                        type: "string",
                        description: "沙箱里的相对路径，例如 report.html",
                    },
                    caption: {
                        type: "string",
                        description: "可选的说明，显示在卡片下方",
                    },
                },
                required: ["path"],
                additionalProperties: false,
            },
        },
    },
    {
        type: "function",
        function: {
            name: "ask_user",
            description:
                "向用户发起一个交互式请求并等待回答。缺少必要信息（城市、偏好、单位等）时使用；一次只问一件事，不要问对话里已经有的信息。kind=text 让用户输入文字，choice 让用户从 options 里选，confirm 让用户确认，location 根据网络 IP 估计用户所在城市（用户会先确认，返回 city/region/country，没有坐标）。",
            parameters: {
                type: "object",
                properties: {
                    question: {
                        type: "string",
                        description: "显示给用户的问题，要具体、简短",
                    },
                    kind: {
                        type: "string",
                        enum: ["text", "choice", "confirm", "location"],
                    },
                    options: {
                        type: "array",
                        items: { type: "string" },
                        description: "kind=choice 时的选项（2-6 个）",
                    },
                    placeholder: {
                        type: "string",
                        description: "文字输入框的提示",
                    },
                },
                required: ["question", "kind"],
                additionalProperties: false,
            },
        },
    },
    {
        type: "function",
        function: {
            name: "show_chart",
            description:
                "把一组数据画成图表显示给用户（柱状图/折线图/饼图）。用户想看趋势、对比或占比时使用；labels 和 values 必须一一对应（最多 30 项），不要用它显示表格类数据。一次只画一张图。",
            parameters: {
                type: "object",
                properties: {
                    type: {
                        type: "string",
                        enum: ["bar", "line", "pie"],
                        description:
                            "bar=柱状图（对比），line=折线图（趋势），pie=饼图（占比）",
                    },
                    title: {
                        type: "string",
                        description: "图表标题，简短",
                    },
                    labels: {
                        type: "array",
                        items: { type: "string" },
                        description: "每个数据点的名称（如分类名、日期）",
                    },
                    values: {
                        type: "array",
                        items: { type: "number" },
                        description: "与 labels 一一对应的数值",
                    },
                    unit: {
                        type: "string",
                        description: "数值单位（如 元、次），可省略",
                    },
                    style: {
                        type: "object",
                        description:
                            "可选外观。默认已经很好看，不要每张图都改；用户明确要求换风格时才用。",
                        properties: {
                            palette: {
                                type: "string",
                                enum: [...CHART_PALETTES],
                                description:
                                    "theme=主题单色（默认），multi=每个分类用不同颜色",
                            },
                            donut: {
                                type: "boolean",
                                description: "饼图是否做成环形图",
                            },
                            legend: {
                                type: "string",
                                enum: [...CHART_LEGENDS],
                                description:
                                    "饼图图例位置：right=右侧（默认），bottom=下方（分类多或名字长时更好），none=不显示",
                            },
                            showValues: {
                                type: "boolean",
                                description:
                                    "柱状图/折线图是否标出数值；默认 true，点太多时会自动隐藏",
                            },
                        },
                        additionalProperties: false,
                    },
                },
                required: ["type", "title", "labels", "values"],
                additionalProperties: false,
            },
        },
    },
    {
        type: "function",
        function: {
            name: "render_ui",
            description:
                "把信息组合成一张只读的展示卡片（标题、指标、文字、列表、表格、进度、标签、图表）。需要一张结构化的小卡片时用；单一图表用 show_chart，长解释用 Markdown。卡片只能展示，不要放按钮、表单、链接、图片，也不要生成仿系统/登录/支付的界面。一次只生成一张卡片，正文不要重复卡片里的数据。",
            parameters: UI_SPEC_SCHEMA,
        },
    },
    {
        type: "function",
        function: {
            name: "memory",
            description:
                "记住或查询用户的长期信息（忌口、习惯、称呼、偏好等），之后每次聊天都会带上。action=save 保存一条（content 一句话，50 字内最好）；action=list 查看已有哪些；action=delete 删除某条（要 id，通常先 list）。用户说「记住…」时用它；琐碎或一次性的信息不要存。",
            parameters: {
                type: "object",
                properties: {
                    action: {
                        type: "string",
                        enum: ["save", "list", "delete"],
                    },
                    content: {
                        type: "string",
                        description: "action=save 时要记的内容",
                    },
                    id: {
                        type: "string",
                        description: "action=delete 时要删除的记忆 id",
                    },
                },
                required: ["action"],
                additionalProperties: false,
            },
        },
    },
    {
        type: "function",
        function: {
            name: "read_url",
            description:
                "读取一个网页链接的正文（自动剥离 HTML）。用户贴了链接、或回答需要引用某个具体网页时使用；只能读公网 http/https 文本页面。",
            parameters: {
                type: "object",
                properties: {
                    url: {
                        type: "string",
                        description: "完整的网页地址",
                    },
                },
                required: ["url"],
                additionalProperties: false,
            },
        },
    },
    {
        type: "function",
        function: {
            name: "read_attachment",
            description:
                "重新读取用户发过的附件（内容已存在本机）。mode=text 返回文本附件的原文（PDF 没有文字原文）。mode=pages 把 PDF 的指定页在本机渲染成图片（表格、盖章、版式都在图里，一次最多 10 页）。当附件内容在消息里被省略、被截断，或用户问的细节不在已发送的内容里时使用。",
            parameters: {
                type: "object",
                properties: {
                    attachmentId: {
                        type: "string",
                        description: "附件标注里的 attachmentId",
                    },
                    mode: {
                        type: "string",
                        enum: ["text", "pages"],
                        description: "text=完整文字；pages=按页渲染图片",
                    },
                    pages: {
                        type: "string",
                        description:
                            'mode=pages 时必填，如 "3" 或 "2-5"，一次最多 10 页',
                    },
                },
                required: ["attachmentId", "mode"],
                additionalProperties: false,
            },
        },
    },
    {
        type: "function",
        function: {
            name: "get_expenses",
            description:
                "查询共享账本的流水和汇总（两个人的账都在里面；每笔带记账人 by，people 是按人汇总的总额和笔数，直接回答「谁花得最多」）。from/to 是 YYYY-MM-DD，省略时默认本月。适合「这个月花了多少」「最近吃饭花了多少」「谁花得多」这类问题；要把结果画出来就用 show_chart。",
            parameters: {
                type: "object",
                properties: {
                    from: {
                        type: "string",
                        description: "开始日期 YYYY-MM-DD（含）",
                    },
                    to: {
                        type: "string",
                        description: "结束日期 YYYY-MM-DD（含）",
                    },
                },
                additionalProperties: false,
            },
        },
    },
    {
        type: "function",
        function: {
            name: "search_posts",
            description:
                "搜索或浏览共享动态（两个人发的帖子都在里面，每条带发布人 by 和评论数 comments）。query 是关键词（可省略=最近发布）；适合「我们去过哪里」「之前说过什么」「谁发的」这类问题。",
            parameters: {
                type: "object",
                properties: {
                    query: {
                        type: "string",
                        description: "关键词，可省略",
                    },
                    limit: {
                        type: "number",
                        description: "条数（1-30，默认 20）",
                    },
                },
                additionalProperties: false,
            },
        },
    },
    {
        type: "function",
        function: {
            name: "get_comments",
            description:
                "读取共享动态下的评论和回复（两个人发的评论都在里面，每条带评论人 by、评论正文、时间、所属动态 postText，回复还带 parentId 和 replyTo）。想知道「最近大家在评论里聊什么」「谁回复了谁」「那条动态下大家怎么说」时用它；只看动态正文用 search_posts。可按动态 post_id、关键词 query 或评论人 author（名字或用户 id）筛选，默认按时间倒序取最近 20 条。",
            parameters: {
                type: "object",
                properties: {
                    post_id: {
                        type: "string",
                        description:
                            "只看某条动态的评论（动态记录 id，可省略）",
                    },
                    query: {
                        type: "string",
                        description: "按评论正文关键词筛选，可省略",
                    },
                    author: {
                        type: "string",
                        description: "按评论人筛选：名字或用户 id，可省略",
                    },
                    limit: {
                        type: "number",
                        description: "条数（1-60，默认 20）",
                    },
                },
                additionalProperties: false,
            },
        },
    },
    {
        type: "function",
        function: {
            name: "log_expense",
            description:
                "帮用户记一笔账。必须先和用户确认品名和金额；调用后会弹出确认卡片，用户点「记下」才真正写入，取消则不记。category 可省略。",
            parameters: {
                type: "object",
                properties: {
                    item: {
                        type: "string",
                        description: "品名，如 午饭、电影票",
                    },
                    price: {
                        type: "number",
                        description: "金额（正数）",
                    },
                    category: {
                        type: "string",
                        description: "分类，可省略",
                    },
                },
                required: ["item", "price"],
                additionalProperties: false,
            },
        },
    },
];

export function toolsForModel(model: { tools: boolean }): ChatToolDefinition[] {
    return model.tools ? [...SANDBOX_TOOLS] : [];
}
