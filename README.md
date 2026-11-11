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

    | 邮箱             | 密码       |
    | ---------------- | ---------- |
    | test@mimi.local  | mimi123456 |
    | test2@mimi.local | mimi123456 |

    开发模式下登录页会多出一张「开发账号」卡片，点一下就能进入。也可以
    直接打开下面的地址自动登录，不用输账号密码：

    - http://localhost:3000/login?dev=test
    - http://localhost:3000/login?dev=test2

    `?dev=test` 也可以加在任意页面上，例如
    http://localhost:3000/jizhang?dev=test 。登录成功后这个参数会自动从
    地址栏去掉。

7. 想停下来时，在终端里按 `Ctrl + C`。

## 三、测试账号说明

- 这两个账号会在你第一次启动项目时**自动创建**，不需要手动注册。
- 它们**只存在于你自己的电脑上**。线上服务器不会创建它们，因为自动创建
  只在本地的开发模式下运行。
- 账号和密码写在代码里，所以只能用来本地测试，**不要用在正式环境**。
- 如果账号已经存在，启动时不会重复创建，也不会改掉你改过的密码。
- 如果删除了本地数据（见下面「本地数据」），下次启动会重新创建它们。
- 想在应用里换账号：个人资料 → 账号 → 退出登录，确认后会回到登录页，
  用另一个账号登录即可。

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

`bun run dev:all` 会同时启动后端（PocketBase + API）和页面，并把页面暴露给
同一 Wi-Fi 下的其他设备（WSL 下会自动加一个 Windows 端口转发，不需要管理员
权限）。数据库不直接对外，Vite 通过 `/db` 和 `/api` 代理访问。

如果只想单独启动后端或页面，可以开两个终端窗口：

```bash
# 终端 1：数据库 + API
bun run dev:backend

# 终端 2：页面
bun run dev:frontend
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

内存吃紧的机器可以再加一行，让打包器只用一个线程：

```dotenv
MIMI_DEV_LOWMEM=1
```

`dev:all` 的峰值内存会从约 1.9GB 降到约 1.5GB，代价是首次打开页面慢
一成左右（想自己定线程数就设 `RAYON_NUM_THREADS`，它优先）。

分开启动时，`bun run dev:frontend` 默认代理到 8090（PocketBase）和 9001（API）；
后端换了端口就加 `PB_PORT=8091 API_PORT=9002 bun run dev:frontend`。

## 六、常用命令

| 命令                   | 作用                               |
| ---------------------- | ---------------------------------- |
| `bun run dev:all`      | 同时启动数据库和页面，手机可访问   |
| `bun run dev:backend`  | 只启动数据库和 API                 |
| `bun run dev:frontend` | 只启动页面                         |
| `bun run build`        | 打包正式版本，并检查代码有没有错误 |
| `bun run typecheck`    | 只检查代码类型（bun check）        |
| `bun run lint`         | 检查代码规范（Biome）              |
| `bun run format`       | 自动整理代码格式（bun fmt）        |
| `bun run format:check` | 检查代码格式                       |
| `bun run test`         | 运行单元测试                       |
| `bun run setup:hooks`  | 启用提交前自动检查（只需运行一次） |

## 七、项目目录（只列常见的）

| 目录                           | 内容                             |
| ------------------------------ | -------------------------------- |
| `app/routes/`                  | 各个页面                         |
| `app/routes/_protected/_main/` | 主要功能：首页、动态、记账、学习 |
| `components/`                  | 页面用到的小组件                 |
| `lib/`                         | 工具函数、登录、数据库连接       |
| `server/`                      | 后端 API：AI 中转、反馈、沙箱    |
| `pocketbase/`                  | 数据表结构、钩子和本地数据目录   |
| `docker/` + `compose.yaml`     | 线上镜像和容器编排               |
| `public/`                      | 图标、清单等静态文件             |
| `scripts/`                     | 一些方便开发的小脚本             |

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
- 修改账号密码等正式环境的事情，请先看 `docker/README.md`。
- 更详细的开发约定（英文）在 `AGENTS.md` 里。

## 十一、线上部署（容器 + Vercel，可选）

线上的页面可以同时存在两份——同一份代码、同一个数据库，互不影响：

- **Vercel**：推送后由 Vercel 自己打包部署（`vercel.json` 里配了
  `framework: vite` / `buildCommand: bun run build` / `outputDirectory: build`）。
- **自托管**：GitHub Actions 构建 `mimi-base-app`（Bun API + SPA + QuickJS）
  和 `mimi-base-pb`（PocketBase + 迁移/钩子），推到阿里云 ACR；宿主机上已有的
  Caddy 把 `/api/*` 和页面转发到 `mimi-app`，把 `/db/*` 转发到 `mimi-pb`。
  Watchtower 负责更新这两个容器，`pb_data` 直接 bind mount 到
  `pocketbase/pb_data`。完整的服务器步骤见 `docker/README.md`。

**Vercel 必须设置环境变量**：`deploy-spa` 用 `same-origin`，而 Vercel 页面
和数据库不在同一个域名，所以在 Vercel 项目的 Environment Variables 里必须
把 `VITE_POCKETBASE_URL` 写成绝对地址：

```
VITE_POCKETBASE_URL=https://pb.example.com
```

`lib/env.ts` 会自动把 PocketBase 挂到 `/db` 下（`https://pb.example.com/db`
也接受）。不能用 `same-origin` 或 `127.0.0.1`，否则 `lib/env.ts` 在页面加载
时会直接抛错（跨域本身没问题，PocketBase 的 API 已允许 CORS）。

**AI 由站点统一提供**：服务器在 `.env.app` 里配置 `OPENCODE_API_KEY`（开发
时放 `.env`），浏览器只带登录令牌访问 `/api/ai` 中转，不需要也不能填自己的 Key。
反向代理必须把 `/api/*` 转发到 `mimi-app:9001` 并关闭响应缓冲（Caddy
`flush_interval -1`），否则流式输出会退化成一次性返回。

**聊天**：底部的「聊天」标签是通用 AI 对话。可选模型由服务端白名单决定
（`OPENCODE_CHAT_MODELS`，见 `docker/README.md`），客户端传其它模型 id
会被拒绝；聊天记录保存在 PocketBase 的 `chat_*` 集合里，只有本人能读写。
AI 的 `sandbox_*` 工具在服务器的 QuickJS 沙箱里运行 JavaScript（标准库，
没有 Node/npm），不读写宿主机文件、不直接联网；`sandbox.fetch` /
`sandbox.download` 由 API 侧按 `read_url` 的规则代取公网内容，访问不到本站
内网、PocketBase 或本站文件/密钥。缺少城市、位置或偏好时，AI 会用
`ask_user` 直接向你提问；定位会弹出浏览器的授权提示。

**两个 origin 的后果（已知并接受）**：Vercel 页面和自托管 PocketBase 页面
是两个不同的域名，浏览器把它们的 Service Worker 缓存、`localStorage`
分开存放。因此：

- `mimi:ai:v1`（AI 通知 / 本机预算）、`mimi-theme`（深浅色）、AI 结果缓存
  `mimi:ai-cache:v1:*` 都是各自独立的；
- AI Key 由服务器统一持有，两边都不需要再填；但 AI 结果缓存仍各自独立；
- 手机上看哪个域名、就用哪一套本地数据。想省事就固定只用一个入口
  （推荐把 Vercel 当作备用，日常用自托管的那个域名）。

更新：推送到 `master` 后，`ci` 通过 → `images` 构建并推送两个镜像 →
`deploy` 调用 Watchtower 更新 `mimi-app` / `mimi-pb`，并校验
`/version.json` 的 sha。只有相关路径变化时才重建对应镜像，所以改前端不会
重启 PocketBase。

- 回滚：`MIMI_TAG=<旧 sha> docker compose up -d`；恢复时去掉 `MIMI_TAG`
  再 `docker compose up -d`。
- 迁移必须只做增量：两个镜像都会自动更新，应用要能容忍旧 schema 几秒钟。
  需要删字段时分成两次发布（先加新字段，再删旧字段）。
- 反向代理：`/api/*` → `mimi-app:9001`（`flush_interval -1`），`/db/*`
  去掉前缀 → `mimi-pb:8090`（同样保留 `flush_interval -1`），其余路径 →
  `mimi-app:9001`；`/db/_/` 仍是管理面板。
- 缓存：`/assets/*` 长缓存，`/`、`/index.html`、`/sw.js`、`/manifest.json`
  不缓存；`/version.json` 供部署后校验新版本是否已生效。
- 备份：PocketBase 的定时备份写到 `pb_data/backups/`，再定期拷到别处；
  不再有 `/db/sync` 的部署前快照。

部署、Caddy、Watchtower、备份和回滚的完整步骤只在 `docker/README.md` 维护。
