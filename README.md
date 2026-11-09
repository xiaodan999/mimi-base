# 秘密基地（mimi-base）

一个用来记录照片、动态和小账本、还能和 AI 聊天的个人小应用。它可以装在
手机主屏幕上，像普通 App 一样打开使用。

这个文件写给第一次运行项目的人。不需要懂太多编程，照着步骤做就可以。

## 一、开始之前

你需要：

- 一台电脑（Windows 的话用 WSL 里的 Ubuntu 终端，macOS / Linux 也可以）
- 一个终端窗口（就是可以输入命令的黑框窗口）
- 已经安装好 [Bun](https://bun.sh)（在终端里输入 `bun --version`，
  能显示版本号就说明装好了）

## 二、第一次运行（按顺序做）

1. 打开终端，进入项目文件夹：

    ```bash
    cd ~/projects/mimi-base
    ```

2. 安装依赖（第一次需要，之后一般不用）：

    ```bash
    bun install
    bun run install:server
    ```

    `install:server` 只装服务端解析 PDF 用的两个包（`pocketbase/package.json`），
    和前端构建分开；不跑也能启动，只是聊天里的文件附件会读不出来。

    建议再运行一次 `bun run setup:hooks`，这样每次提交前会自动
    整理格式并检查类型和测试。

3. 创建本地配置文件：

    ```bash
    cp .env.example .env
    ```

4. 启动整个项目（数据库 + 页面）：

    ```bash
    bun run dev:all
    ```

    第一次启动可能会下载数据库程序，需要等一会儿。看到类似
    `VITE ... ready` 的字样就说明成功了。终端最后会打印一个手机访问地址，
    同一 Wi-Fi 下打开即可（数据库仍然只监听本机，页面通过 `/api` 代理访问）。

5. 用浏览器打开：

    http://localhost:3000

6. 用下面的测试账号登录：

    | 邮箱            | 密码       |
    | --------------- | ---------- |
    | test@mimi.local | mimi123456 |

7. 想停下来时，在终端里按 `Ctrl + C`。

## 三、测试账号说明

- 这个账号会在你第一次启动项目时**自动创建**，不需要手动注册。
- 它**只存在于你自己的电脑上**。线上服务器不会创建它，因为自动创建
  只在本地的开发模式下运行。
- 账号和密码写在代码里，所以只能用来本地测试，**不要用在正式环境**。
- 如果账号已经存在，启动时不会重复创建，也不会改掉你改过的密码。
- 如果删除了本地数据（见下面「本地数据」），下次启动会重新创建它。

## 四、常用的地址

| 地址                             | 作用                         |
| -------------------------------- | ---------------------------- |
| http://localhost:3000            | 应用页面                     |
| http://127.0.0.1:8090/_/         | 数据库管理后台（PocketBase） |
| http://127.0.0.1:8090/api/health | 检查数据库是否正常           |
| `dev:all` 打印的手机地址         | 同一 Wi-Fi 下用手机访问      |

数据库管理后台（`/_/`）用的是 PocketBase 自带的管理员账号，和应用里的
测试账号不是一回事。第一次启动时会自动创建一个，直接用它登录：

| 邮箱           | 密码       |
| -------------- | ---------- |
| dev@mimi.local | mimi123456 |

它同样只在本地、只在开发模式下创建，线上不会存在；已经存在的管理员不会
被覆盖。忘记密码时可以这样重置：

```bash
cd pocketbase
./pocketbase superuser upsert dev@mimi.local mimi123456
```

## 五、也可以分开启动

`bun run dev:all` 会同时启动两个部分，并把页面暴露给同一 Wi-Fi 下的
其他设备（WSL 下会自动加一个 Windows 端口转发，不需要管理员权限）。
数据库不直接对外，只由 Vite 通过 `/api` 代理访问。

如果只想单独启动其中一个，可以开两个终端窗口：

```bash
# 终端 1：数据库
bun run db

# 终端 2：页面
bun run dev
```

同时开多个 worktree 也没问题：每个 worktree 有自己的
`pocketbase/pb_data/`，`dev:all` 会自动跳过被占用的端口（WSL 和
Windows 两侧都会检查），并打印各自的手机地址。

想固定端口，写进这个 worktree 的 `.env`（shell 变量优先）：

```dotenv
VITE_PORT=3001
PB_PORT=8091
```

之后照常 `bun run dev:all`。每个 worktree 的 Vite 只代理到自己的
PocketBase，互不影响；终端里会打印这一个是哪个地址。

分开启动时，`bun run dev` 默认代理到 8090；数据库换了端口就加
`PB_PORT=8091 bun run dev`。

## 六、常用命令

| 命令                   | 作用                               |
| ---------------------- | ---------------------------------- |
| `bun run dev:all`      | 同时启动数据库和页面，手机可访问   |
| `bun run db`           | 只启动数据库                       |
| `bun run dev`          | 只启动页面                         |
| `bun run build`        | 打包正式版本，并检查代码有没有错误 |
| `bun run typecheck`    | 只检查代码类型（bun check）        |
| `bun run lint`         | 检查代码规范（ESLint）             |
| `bun run format`       | 自动整理代码格式（bun fmt）        |
| `bun run format:check` | 检查代码格式                       |
| `bun run test`         | 运行单元测试                       |
| `bun run setup:hooks`  | 启用提交前自动检查（只需运行一次） |

## 七、项目目录（只列常见的）

| 目录                           | 内容                                 |
| ------------------------------ | ------------------------------------ |
| `app/routes/`                  | 各个页面                             |
| `app/routes/_protected/_main/` | 主要功能：首页、动态、记账、学习     |
| `components/`                  | 页面用到的小组件                     |
| `lib/`                         | 工具函数、登录、数据库连接           |
| `pocketbase/`                  | 后端：数据库、数据表结构、服务端脚本 |
| `public/`                      | 图标、清单等静态文件                 |
| `scripts/`                     | 一些方便开发的小脚本                 |

## 八、本地数据在哪里

- 所有本地数据（账号、照片、帖子、账目）都在 `pocketbase/pb_data/`。
- 这个文件夹不会上传到 git，只属于你自己的电脑。
- 如果想**清空重来**：先按 `Ctrl + C` 停止项目，然后执行

    ```bash
    rm -rf pocketbase/pb_data
    ```

    再重新 `bun run dev:all`，测试账号会自动重新创建。
    **注意：这会删掉本地所有数据，操作前请确认。**

## 九、常见问题

**打不开 http://localhost:3000**

先看终端有没有报错，并确认还停留在 `dev:all` 的界面。等出现
`ready` 后再刷新浏览器。

**提示缺少 `.env` 文件**

执行一次：

```bash
cp .env.example .env
```

**`bun: command not found`**

Bun 没装好，或者终端需要重新打开一次。可以到
https://bun.sh 按提示安装。

**端口被占用**

多半是之前启动的窗口还没关。关掉旧终端，或者按 `Ctrl + C` 停止后
再重新启动。

**登录失败**

检查邮箱和密码有没有输错。如果之前删过本地数据，直接重启项目，
账号会重新创建。

## 十、注意事项

- 不要提交 `.env`、`.env.prod` 和 `pocketbase/pb_data/`。
- 修改账号密码等正式环境的事情，请先看 `pocketbase/README.md`。
- 更详细的开发约定（英文）在 `AGENTS.md` 里。

## 十一、线上自托管前端（可选）

线上的页面可以同时存在两份——同一份代码、同一个数据库，互不影响：

- **Vercel**：推送后由 Vercel 自己打包部署（`vercel.json` 里配了
  `framework: vite` / `buildCommand: bun run build` / `outputDirectory: build`）。
- **PocketBase**：GitHub Actions 里的 `deploy-spa` 工作流打包
  （`VITE_POCKETBASE_URL=same-origin`），把产物传到服务器的
  `/spa/publish`，存进仓库目录下的 `build/`，由 PocketBase 直接对外提供。

**Vercel 必须设置环境变量**：`deploy-spa` 用 `same-origin`，而 Vercel 页面
和数据库不在同一个域名，所以在 Vercel 项目的 Environment Variables 里必须
把 `VITE_POCKETBASE_URL` 写成绝对地址：

```
VITE_POCKETBASE_URL=https://pb.example.com
```

`lib/env.ts` 会自动把 PocketBase 挂到 `/db` 下（`https://pb.example.com/db`
也接受）。不能用 `same-origin` 或 `127.0.0.1`，否则 `lib/env.ts` 在页面加载
时会直接抛错（跨域本身没问题，PocketBase 的 API 已允许 CORS）。

**AI 由站点统一提供**：服务器在 `.env.prod` 里配置 `OPENCODE_API_KEY`（开发
时放 `.env`），浏览器只带登录令牌访问 `/api/ai` 中转，不需要也不能填自己的 Key。
反向代理必须把 `/api/*` 转发到 `:9001` 并关闭响应缓冲（nginx
`proxy_buffering off`），否则流式输出会退化成一次性返回。

**聊天**：底部的「聊天」标签是通用 AI 对话。可选模型由服务端白名单决定
（`OPENCODE_CHAT_MODELS`，见 `pocketbase/README.md`），客户端传其它模型 id
会被拒绝；聊天记录保存在 PocketBase 的 `chat_*` 集合里，只有本人能读写。
AI 的 `sandbox_*` 工具在服务器的隔离 Docker 容器里运行 Python 或
JavaScript（Node），可以访问公网查天气、网页和公开接口，但不能访问本站
内网、PocketBase 或读取本站文件/密钥。缺少城市、位置或偏好时，AI 会用
`ask_user` 直接向你提问；定位会弹出浏览器的授权提示。没有 Docker 的开发
环境会退回直接运行 `python3` / `node`，仅用于本地调试，不是安全边界。

**两个 origin 的后果（已知并接受）**：Vercel 页面和自托管 PocketBase 页面
是两个不同的域名，浏览器把它们的 Service Worker 缓存、`localStorage`
分开存放。因此：

- `mimi:ai:v1`（AI 通知 / 本机预算）、`mimi-theme`（深浅色）、AI 结果缓存
  `mimi:ai-cache:v1:*` 都是各自独立的；
- AI Key 由服务器统一持有，两边都不需要再填；但 AI 结果缓存仍各自独立；
- 手机上看哪个域名、就用哪一套本地数据。想省事就固定只用一个入口
  （推荐把 Vercel 当作备用，日常用自托管的那个域名）。

第一次部署：在 GitHub 的 Actions 页面运行一次 `deploy-spa`（或点
Run workflow）。之后推送到 `master` 的前端改动会自动发布。

- 发布失败不会影响正在用的旧版本：服务器把产物解压到 `build.next/` 的
  一个新版本目录，校验 tarball 的 sha256、逐个检查条目、确认有
  `index.html` 后，才用**一次原子改名**切换 `build` 软链接；旧版本留作
  `build.next/` 里的其他版本目录，可回滚。
- 想退回上一版：带上部署令牌请求 `POST /spa/rollback`；再调一次就换回来。
- 换前端不需要重启数据库：PocketBase 每次请求都直接读 `build/`。
- **`/spa/publish` 只更新前端产物，不会更新服务器代码**：`deploy-spa`
  发布成功后会再调 `POST /repo/sync`（只做 `git pull --ff-only`，不重启
  PB），让服务器上的 checkout 跟上已部署的 commit；改到 `pocketbase/**`
  仍由 `deploy-db` 的 `/db/sync` 负责拉代码、备份、重启。
- 反向代理：`/api/*` 转发到 `:9001`（关闭响应缓冲），`/db/*` 去掉 `/db` 前缀
  后转发到 PocketBase `:8090`（管理面板是 `/db/_/`），`/db/sync` 作为精确路径
  优先转发到 `:9001`；`/spa/*`、`/repo/*` 也转发到 `:9001`。给 `/assets/*` 设长
  缓存，给 `/`、`/index.html`、`/sw.js`、`/manifest.json` 设不缓存（PocketBase
  自己不发缓存头）。版本文件 `/version.json` 供部署后校验新版本是否已生效。

部署、systemd、反向代理、快照恢复等运维细节刻意不放进仓库，只在服务器上维护；
后端英文说明见 `pocketbase/README.md` 的 Frontend 一节。
