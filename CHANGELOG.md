# 更新日志

本文件记录面向使用者的主要变更，按日期分组（最新的在最上面），格式参考 Keep a Changelog。

## 2026-11-07

### 新增

- 新增通用聊天：底部第 6 个标签「聊天」，支持多对话、从第一条消息自动起标题、改名和删除；历史存 PocketBase，按 `owner` 隔离，只有本人能读写。
- 新增 `chat_conversations` / `chat_messages` / `chat_personas` 三个集合及迁移：消息以 assistant-ui 的 content parts 存 JSON，`seq` 保证顺序；自定义人格存 PB，对话创建时快照人格名称与设定。
- 聊天使用 assistant-ui 的外部存储运行时（`useExternalStoreRuntime`），接入自己的流式请求和持久化；正文、思考过程、工具调用都以增量渲染。
- 新增 `POST /ai/chat/completions` 与 `GET /ai/models`：模型来自服务端白名单（`pocketbase/chat-models.ts` + `OPENCODE_CHAT_MODELS`），未知 id 返回 400；纯文本模型会移除工具，非视觉模型拒收图片。旧的 `/ai/opencode/v1/chat/completions` 行为不变，仍由服务端强制单一模型。
- 新增 `sandbox_run` / `sandbox_read` / `sandbox_write` / `sandbox_list` 代码工具，文件快照随对话保存（初版在浏览器 Worker 中执行，同日改为服务器 Docker 沙箱，见下）。
- 聊天交互：流式回复、思考过程折叠、停止、重新生成、复制、Markdown/GFM 表格/代码块（带复制按钮）；模型支持视觉时才能附加图片，图片只随当前消息发送。
- 语音输入使用手机键盘自带的听写，不引入应用内录音。
- 补充 `bun test` 覆盖：SSE 与工具调用增量解析、标题生成、prompt 组装、沙箱协议与路径校验、模型白名单与中转拒绝逻辑。
- 聊天模型白名单收敛为 DeepSeek V4.1 Flash / GLM-5.3 Flash / MiMo 2.6 Flash；三者都支持图片与工具，DeepSeek 和 GLM 额外支持 `reasoning_effort` 的低 / 高 / 最高。
- 新增 `chat_conversations.thinking`（迁移 `1795200000_add_chat_thinking.js`）与会话内的「思考强度」选择；`POST /ai/chat/completions` 校验并透传 `reasoning_effort`，模型不支持的强度返回 400。
- 新增内置「英语老师」人格，prompt 强制只输出英文。
- 聊天输入框显示上下文占用百分比：取最近一次助手回复的 `prompt_tokens` 除以模型的 `contextWindow`，`/ai/models` 因此新增 `contextWindow`；达到 80% / 95% 时变色提醒。
- 沙箱改为在服务器的 Docker 容器里运行：`pocketbase/sandbox/` 提供 Python / Node 两个 runner、Dockerfile 和网络脚本；`sandbox_run.language` 选 `python` 或 `javascript`；`POST /ai/sandbox` 通过 PB 令牌鉴权，限制每用户 1 个并发、每天 200 次。
- 沙箱容器只读根文件系统、非 root 用户、丢弃全部 capabilities、`no-new-privileges`、256MB / 0.5 CPU / 64 PID / 20 秒上限；代码从 stdin 传入，不落在命令行。
- 独立的 `mimi-sandbox` bridge 只允许公网 DNS/HTTP(S)，在 `DOCKER-USER`/`FORWARD` 和 `INPUT` 两处拦截 loopback、内网、宿主地址和非 Web 端口；沙箱因此能查实时信息但碰不到 PocketBase、Caddy 或 SSH。Python 与 JavaScript 共用同一套容器加固和网络策略。
- 新增 `ask_user` 工具：模型可以动态请求文字、选项、确认或浏览器定位，客户端内联面板收集答案后再把结果交回模型，同一段回复继续；等待期间输入框禁用，停止/切换对话会取消请求。
- 定位使用浏览器 `navigator.geolocation`（会弹系统授权），通过 BigDataCloud 反查城市名；反查失败时仍返回经纬度。工具结果保存在该对话里（owner 隔离）。

### 修复

- 更正 `deepseek-v4.1-flash` 的视觉能力：它支持图片输入，`chat-models.ts` 现在标记为 `vision: true`；GLM-5.3 Flash 与 MiMo 2.6 Flash 同样标记为多模态。
- 修复手机端回复结束瞬间的闪动：live 草稿改到持久化消息就绪后再移除，`createMessage` 不再等待 refetch（避免同一回复短暂渲染两份），Markdown 关闭 smooth / defer，消息操作栏预留固定高度。
- 隐藏聊天输入框超过 6 行时的原生滚动条（提交按钮左侧的竖灰条），文本仍然可以滚动。
- 修复 AI 代码工具无法查询实时信息的问题：不再使用浏览器 Worker，改到服务器容器里执行并允许受限公网访问。

### 变更

- `.env.example` 与 `pocketbase/README.md` 补充聊天模型白名单、思考强度与 `/ai` 新端点的说明。
- `GET /ai/models` 增加 `thinkingLevels`，模型选择器同时展示三个模型和当前思考强度。
- 代码工具支持 Python（标准库）和 JavaScript（Node），工具描述与系统提示同步更新；`SANDBOX_BASE_IMAGE` / `SANDBOX_BASE_IMAGE_NODE` 可指定国内可用的基础镜像源。
- `ask_user` 加入聊天工具列表，系统提示要求缺少城市/位置/偏好/确认时先问用户，用户拒绝定位后改用文字问城市；回答面板关闭后自动滚到底部。
- 首页与动态合并：`/home` 直接渲染动态流，底部导航去掉「动态」保留五项（首页 / 聊天 / 记账 / 学习 / 我的）。动态的查询、组件与工具函数从 `posts/` 路由抽到 `app/feed/`（`data.ts`、`utils.ts`、`comments.ts`、`components/`），首页的 `-home/feed.tsx` 以 `React.lazy` 单独分包，问候卡先绘制。
- `/posts` 与 `/photos` 改为重定向到 `/home`，`search: true` 保留 `?month=` / `?q=` 过滤参数；`/photos` 不再经过 `/posts`。
- 首页头部压缩为问候卡：统计数据收成一行三格（本月花费 → 记账，连续学习 → 学习），晚餐抽奖机改成图标按钮，移除学习基地入口（底部「学习」已覆盖）与「问问我的基地」入口（删除 `-home/ask-sheet.tsx`）。
- 「年度报告」入口移到个人资料页；「去年今天」由首页卡片改为穿插在动态流第二条之后。
- 下拉刷新同时刷新首页统计（`qk.homeStats.all`），提交 / 编辑 / 删除动态仍会同时失效列表与统计缓存。
- `post/new-poo` 的 `useNewPostMutation` 改从 `@/app/feed/data` 引入；AI 面板回归测试移除已删除的 `ask-sheet.tsx`。
- AI 任务提示 pill 上移到搜索按钮之上（`app/ai/AiTaskCenter.tsx`），避免和动态流左下角的搜索按钮重叠。

## 2026-11-06

### 新增

- 新增 `components.json`、依赖自动更新配置与安全 / 贡献文档。
- 预提交钩子增加 `lint`、`format:check`、`typecheck:tsc` 校验。
- 新增「关于」页：显示当前构建、可手动检查更新，并按日期记录每次构建的变化；个人资料页和首页底部均可进入。

### 修复

- PWA 在 iOS 上补齐 `viewport-fit=cover`，主题色随深浅色模式同步。
- 交互控件补充 `active:` 反馈，加载 / 错误状态补齐无障碍语义。
- 移除未使用的依赖与 shadcn 原语。
- `/version.json` 不再经过 Service Worker 缓存，避免「检查更新」比到旧版本。
- 「关于」页在电脑上无法滚动到底部：该页在应用外壳之外，现在自己滚动。
- 学习模块的卡片、表格和互动组件不再用 `dangerouslySetInnerHTML` 渲染题库内容，统一走 `renderRichText`；只有本地生成的 SVG 保留在 `SvgMarkup` 一处，并由测试锁定内容可用的标签。
- 头像调用统一传入 `user_name`，读屏时输出「<name>的头像」。
- 移除 Service Worker 里从未被订阅的 `push` 监听（应用只用本地 `Notification`）。

### 变更

- `bun test` 现在覆盖整个仓库，而不再只扫描 `app/`、`lib/`。
- `bun.lock` 的下载地址统一为默认 npm 源。
- CI 工作流显式声明 `permissions: contents: read`，第三方 action 固定到提交 SHA。
- 更新记录按构建日期组织，不再依赖版本号。
- 新增更新记录的维护约定：用户可见变更同时写入 `app/about/updates.ts` 与 `CHANGELOG.md`，并由测试检查格式、顺序与日期对应。
- 更新记录改为按日期折叠展示，默认展开最新一条。
- 个人资料页移除左上角返回箭头：它是底部导航的一级页面，保留返回箭头会让人误以为还有上一页。
- 学习基地与科目页移除右上角的 AI 设置入口：个人资料页已经提供同样的设置，不再重复放按钮。

## 0.0.1

- 首个版本：动态、记账、学习、年度报告与 AI 辅助功能。
