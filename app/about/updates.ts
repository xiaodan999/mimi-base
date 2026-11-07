/**
 * What changed in each build, newest first. This is the in-app update log —
 * no version bump involved; entries are identified by the day they shipped.
 *
 * Entries are compiled into the bundle, so whatever is listed here is exactly
 * what the running build includes. Keep the bullets user-facing (Chinese,
 * no file paths); `date` is also the "seen" marker on the profile page.
 * Pair every entry with a `CHANGELOG.md` bullet (see AGENTS.md → Update log).
 */
/** In-app destinations an update entry can link to. */
export type UpdatePath =
    | "/home"
    | "/posts"
    | "/chat"
    | "/jizhang"
    | "/study"
    | "/profile"
    | "/report";

export type UpdateLink = {
    label: string;
    to: UpdatePath;
};

export type Update = {
    /** `YYYY-MM-DD`; also identifies the entry for the unseen dot. */
    date: string;
    /** Optional short headline, e.g. 关于页上线. */
    title?: string;
    /** One sentence shown under the title; keep it under 45 characters. */
    summary?: string;
    /** Marquee bullet copied verbatim from added/fixed/changed. */
    highlight?: string;
    /** Shortcuts into the app, shown under the entry. */
    links?: UpdateLink[];
    added?: string[];
    fixed?: string[];
    changed?: string[];
};

export const UPDATES: Update[] = [
    {
        date: "2026-11-07",
        title: "聊天上线",
        summary: "聊天、隔离代码运行，和一个会向你提问的 AI。",
        highlight:
            "聊天里的 HTML、Markdown、CSV、JSON、SVG 文件可以全屏预览和下载，预览在隔离环境里打开，脚本不会运行。",
        links: [{ label: "去聊天", to: "/chat" }],
        added: [
            "聊天里的 HTML、Markdown、CSV、JSON、SVG 文件可以全屏预览和下载，预览在隔离环境里打开，脚本不会运行。",
            "AI 生成或下载的图片会直接显示在对话里，点开可以全屏查看、缩放，也能保存到手机。",
            "AI 可以把沙箱里的文件发给你：对账单 HTML、Markdown 笔记、CSV 表格都能在聊天里直接打开。",
            "AI 可以在回复里直接画图表了：柱状图、折线图、饼图，问「这个月花了多少」这类问题时可以配图回答。",
            "AI 有了长期记忆：说「记住……」它就会存下来，以后的聊天都会记得（聊天列表右上角可以查看和删除）。",
            "AI 可以读你发的网页链接（read_url），查共享账本流水、搜两人发过的动态，也能在确认后帮你记一笔账。",
            "对话列表支持搜索和按人格筛选，还可以置顶常用对话。",
            "发送的消息可以编辑后重发；任何一条消息都能「分叉」成一个新对话；回复可以换个模型重新生成；对话可以导出为 Markdown 分享或复制。",
            "空对话会显示该人格的快捷提问，点一下就能开始。",
            "分享到「秘密基地」的图片和链接可以直接带进新聊天；代码块有了语法高亮。",
            "新增「聊天」标签页：和 AI 一对一聊天，可以开很多段对话，随时改名或删除。",
            "每段对话可以单独挑人格和模型；回复支持 Markdown、代码块和表格，能看思考过程、停止、重新生成和复制。",
            "支持视觉的模型可以发图片；AI 还能在隔离环境里运行代码、读写这段对话的文件，用来计算和验证。",
            "聊天可以选 DeepSeek V4.1 Flash、GLM-5.3 Flash 或 MiMo 2.6 Flash；DeepSeek 和 GLM 还能调思考强度（低 / 高 / 最高）。",
            "新增「英语老师」人格：只用英文回答，讲语法、词汇和地道表达。",
            "聊天输入框会显示上下文用了多少（百分比），接近上限时变色提醒。",
            "AI 的代码工具改为在服务器的隔离容器里运行，支持 Python 和 JavaScript，可以联网查天气、网页和公开接口，但访问不到本站的数据。",
            "AI 需要信息或授权时会直接问你：可以输入文字、选选项、确认，或允许浏览器定位；回答后它继续同一段回复。",
        ],
        fixed: [
            "拍订单截图记账时，一笔订单只记一条：金额按实付算，不再拆成好几笔；名称默认记商品名（如「葡萄鲜切柠檬茶」而不是「瑞幸咖啡」），麻辣烫、火锅这类现做的一餐记店名。",
            "修复手机上「从动态选择图片」和「AI 的长期记忆」面板无法上下滑动的问题。",
            "聊天回复在离开对话后继续生成：回来能看到仍在生成的内容，完成后会收到提示，也不会再重复发送或把正在跑的工具调用误标为失败。",
            "AI 提问后刷新页面，问题不再丢失：重新打开聊天会恢复提问卡片，回答后接着生成。",
            "打开有历史的对话时，不再先闪一下「新对话」的推荐提问，而是等消息加载完直接显示内容。",
            "DeepSeek V4.1 Flash 现在可以直接发图片。",
            "修复手机上看完回复时画面闪一下的问题。",
        ],
        changed: [
            "运行代码后生成的文件不再只显示数量：聊天里会给出预览/下载入口，也可以直接让 AI「把文件发给我」。",
            "内置人格精简为通用助手、写作助手和英语老师，并新增「基地管家」：了解这个 App 的各项功能，能查账本、搜动态、帮你记账（需确认）和长期记住你的偏好。",
            "聊天记录只保存在自己的账号里，换设备登录也能接着聊。",
            "语音输入交给手机键盘自带的听写，应用里不再单独录音。",
            "代码工具支持 Python 和 JavaScript：Python 用 result，JavaScript 用 return，文件读写和联网方式一致。",
            "问天气或附近信息时，AI 可以直接请求当前位置，不用你手动报城市。",
            "底部导航精简为五项：动态并入首页，打开首页往下就是动态流，下拉可以刷新。",
            "首页顶部更紧凑：今日动态、本月花费、连续学习收成一行，点击花费或学习可直接跳转。",
            "「去年今天」改为穿插在动态流里，翻到第二条动态后就能看到往年的记录。",
            "「年度报告」移到「我的」页；晚餐抽奖机收成首页右上角的小图标。",
            "「关于」页的更新记录改成时间线：每条更新有一句话概要和重点条目，还能直接跳到对应功能。",
        ],
    },
    {
        date: "2026-11-06",
        title: "关于页上线",
        summary: "更新记录终于有地方住了。",
        added: [
            "新增「关于」页：查看当前构建、检查更新，并浏览历次变化。",
            "首页底部和个人资料页都可以进入「关于」。",
        ],
        fixed: [
            "检查更新时不再读到被缓存住的旧构建信息。",
            "修复「关于」页在电脑上无法滚动到底部的问题。",
            "学习卡片的口诀、表格和提示改为安全渲染，加粗和换行的显示保持不变。",
            "使用读屏时，头像会读出「某某的头像」，不再只是装饰图。",
        ],
        changed: [
            "更新记录可以折叠，默认展开最新一条，更早的收起来。",
            "个人资料页去掉了左上角的返回箭头，从底部导航进入时不再像还能返回上一页。",
            "学习基地和科目页去掉了右上角的 AI 设置按钮，个人资料页就能进入 AI 设置。",
        ],
    },
];
