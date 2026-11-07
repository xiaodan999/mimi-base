/**
 * What changed in each build, newest first. This is the in-app update log —
 * no version bump involved; entries are identified by the day they shipped.
 *
 * Entries are compiled into the bundle, so whatever is listed here is exactly
 * what the running build includes. Keep the bullets user-facing (Chinese,
 * no file paths); `date` is also the "seen" marker on the profile page.
 * Pair every entry with a `CHANGELOG.md` bullet (see AGENTS.md → Update log).
 */
export type Update = {
    /** `YYYY-MM-DD`; also identifies the entry for the unseen dot. */
    date: string;
    /** Optional short headline, e.g. 关于页上线. */
    title?: string;
    added?: string[];
    fixed?: string[];
    changed?: string[];
};

export const UPDATES: Update[] = [
    {
        date: "2026-11-07",
        title: "聊天上线",
        added: [
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
            "DeepSeek V4.1 Flash 现在可以直接发图片。",
            "修复手机上看完回复时画面闪一下的问题。",
        ],
        changed: [
            "聊天记录只保存在自己的账号里，换设备登录也能接着聊。",
            "语音输入交给手机键盘自带的听写，应用里不再单独录音。",
            "代码工具支持 Python 和 JavaScript：Python 用 result，JavaScript 用 return，文件读写和联网方式一致。",
            "问天气或附近信息时，AI 可以直接请求当前位置，不用你手动报城市。",
            "底部导航精简为五项：动态并入首页，打开首页往下就是动态流，下拉可以刷新。",
            "首页顶部更紧凑：今日动态、本月花费、连续学习收成一行，点击花费或学习可直接跳转。",
            "「去年今天」改为穿插在动态流里，翻到第二条动态后就能看到往年的记录。",
            "「年度报告」移到「我的」页；晚餐抽奖机收成首页右上角的小图标。",
        ],
    },
    {
        date: "2026-11-06",
        title: "关于页上线",
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
