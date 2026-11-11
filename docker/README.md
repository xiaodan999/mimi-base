# 自托管部署（容器）

生产环境是两个容器加一个已有的 Caddy：

```
                 Caddy（宿主机已有容器，caddy-net）
                  │ /db/*                      │ /api/*、/
                  ▼                            ▼
             mimi-pb :8090                mimi-app :9001
        PocketBase + pb_migrations      Bun API + build/ + QuickJS
        pb_data 绑定到宿主机             （不挂载任何数据目录）
```

- `mimi-pb`：PocketBase 0.40.6，启动时先 `migrate up` 再 `serve`，数据在
  `./pocketbase/pb_data`（宿主机目录直接 bind mount）。
- `mimi-app`：Bun API、静态 SPA、QuickJS 沙箱；PDF 附件、ffmpeg、AI 中转都在这里。
- 两个容器都只加入外部网络 `caddy-net`，**不发布任何端口**。Caddy 按容器名反代。
- 镜像来自阿里云 ACR，由 Watchtower 更新；不再使用 `/db/sync`、`/spa/publish`、
  `/repo/sync`、`/spa/rollback`，也不再需要 `DEPLOY_TOKEN`。

下文用几个占位符，按你的环境替换：

```bash
REPO_DIR=<仓库 checkout 目录>        # 例如 /srv/mimi-base
BACKUP_DIR=<pb_data 备份目录>        # 例如 /srv/backups
CADDY_CONTAINER=<Caddy 容器名>
CADDY_CONFIG_DIR=<Caddy 配置目录>    # 例如 /srv/caddy
APP_HOST=<对外域名>                  # 例如 app.example.com
ALIYUN_ACR=<ACR 公网地址>            # 例如 registry.cn-guangzhou.aliyuncs.com
NAMESPACE=<ACR 命名空间>
```

## 一、首次部署

### 1. 准备目录和密钥

在服务器上使用仓库 checkout 作为 compose 目录：

```bash
cd "$REPO_DIR"
git pull --ff-only

cp docker/.env.app.example .env.app
chmod 600 .env.app
# 填 PB_URL=http://mimi-pb:8090、OPENCODE_*、GITHUB_*、SUPERUSER_*
```

`pb_data` 直接使用现有的 `pocketbase/pb_data`，不需要建卷或复制。

### 2. 确认 Caddy 网络

```bash
docker network ls | grep caddy-net
docker inspect "$CADDY_CONTAINER" \
  --format '{{range $k,$v := .NetworkSettings.Networks}}{{$k}}{{println}}{{end}}'
```

`compose.yaml` 里的 `caddy-net` 必须和上面一致。把 `docker/Caddyfile.example`
的站点块并进现有的 `"$CADDY_CONFIG_DIR"/Caddyfile`，把域名换成 `$APP_HOST`：

- `/db/*` 用 `handle_path` 去掉前缀后转到 `mimi-pb:8090`，保留 `flush_interval -1`；
- `/api/*` 和兜底路径转到 `mimi-app:9001`；
- 保留静态缓存头（或者只靠 app 自己发的头）。

校验并热加载：

```bash
docker exec "$CADDY_CONTAINER" \
  caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
docker exec "$CADDY_CONTAINER" \
  caddy reload  --config /etc/caddy/Caddyfile --adapter caddyfile
```

### 3. 挂上 Watchtower

Watchtower 按**容器名**监控，并且是 HTTP API 模式（没有
`--http-api-periodic-polls`），所以必须把 `mimi-app`、`mimi-pb` 加进它的
容器列表，并让 CI 调用它的更新接口。在现有 Watchtower 的 compose 文件里，
保留列表里原有的容器名，只追加这两个：

```yaml
command: <原有容器…> mimi-app mimi-pb --http-api-update
```

```bash
docker compose -f <watchtower-compose-file> up -d
docker logs --tail=30 <watchtower-container>
```

它需要能读到 ACR 的登录信息（例如挂载 `/root/.docker/config.json`），
否则私有仓库拉不下来。

### 4. 冒烟检查

```bash
curl -fsS "https://$APP_HOST/api/health"
curl -fsS "https://$APP_HOST/db/api/health"
curl -fsS "https://$APP_HOST/version.json"
```

浏览器：登录、发一条带图/视频的动态、AI 流式回复、`sandbox_run`、问题反馈。

## 二、日常更新

`master` 推送后：

1. `ci` 通过；
2. `images` 构建并推送 `mimi-base-app` / `mimi-base-pb` 的 `:latest` 和 `:$sha`
   到阿里云 ACR（只有相关路径变化时才构建对应镜像）；
3. `deploy` 调用 Watchtower 的 `$WATCHTOWER_HTTP_API_URL`；
4. Watchtower 拉取并重建对应容器；`deploy` 轮询 `version.json` 确认新 sha。

手动触发（CI 之外的紧急更新）：

```bash
curl -fsS -G \
  -H "Authorization: Bearer $WATCHTOWER_HTTP_API_TOKEN" \
  --data-urlencode "image=$ALIYUN_ACR/$NAMESPACE/mimi-base-app" \
  "$WATCHTOWER_HTTP_API_URL"
```

`WATCHTOWER_HTTP_API_URL` / `WATCHTOWER_HTTP_API_TOKEN` 来自仓库 secrets
（`Production` environment）。

**迁移规则**：两个镜像都自动更新，所以 `pb_migrations` 必须只做增量
（新增字段/集合，不删不改语义），应用代码必须能容忍上一个 schema 几秒钟。
需要删字段或重命名时，分两次发布（先加新字段，再删旧字段）。

**回滚**：

```bash
cd "$REPO_DIR"
MIMI_TAG=<old-sha> docker compose up -d
```

`MIMI_TAG` 是 shell 变量，compose 会用它替换镜像 tag；恢复时去掉它再
`docker compose up -d`。如果这次发布包含破坏性迁移，先停 PB，
从 `$BACKUP_DIR` 或 `pb_data/backups` 恢复 `pb_data` 再启动。

## 三、备份

PB 的定时备份（Dashboard → Settings → Backups）会把 `pb_data`（含上传文件）
打成 zip 放到 `pb_data/backups/`。在宿主机加一个 cron 把备份拷到别处：

```bash
# /etc/cron.d/mimi-backup
15 3 * * * root rsync -a --delete \
  "$REPO_DIR/pocketbase/pb_data/backups/" "$BACKUP_DIR/pb/"
```

每天确认一次 `$BACKUP_DIR/pb/` 有新文件；恢复演练：停 `mimi-pb`，把 zip
解到空的 `pb_data`，再启动。

## 四、日志和排障

```bash
docker compose logs -f --tail=100 mimi-app mimi-pb
docker stats --no-stream
docker compose ps
```

- `mimi-app` 起不来：看 `PB_URL` 是否能解析（`docker compose exec mimi-app
wget -qO- http://mimi-pb:8090/api/health`）。
- 静态页面 404：确认 `build/` 在镜像里（`docker run --rm --entrypoint ls
<image> /app/build`），以及 Caddy 兜底指向 `mimi-app:9001`。
- AI 503：`.env.app` 里 `OPENCODE_API_KEY` 为空；改完 `docker compose up -d`
  重建容器（`restart` 不会重读 env_file）。
- 沙箱 503：`mimi-app` 启动时 QuickJS 加载失败，看日志里的 `[sandbox]`。

## 五、环境变量

`mimi-app` 的 `.env.app`（完整示例见 `docker/.env.app.example`）：

| 变量                                     | 说明                                       |
| ---------------------------------------- | ------------------------------------------ |
| `PB_URL`                                 | `http://mimi-pb:8090`（不能带 `/db`）      |
| `PORT`                                   | 容器内监听端口，默认 9001                  |
| `OPENCODE_API_KEY`                       | 站点 AI key；空则 AI 返回 503              |
| `OPENCODE_MODEL`                         | 旧接口强制模型，默认 `deepseek-v4.1-flash` |
| `OPENCODE_CHAT_MODELS`                   | 可选，聊天模型白名单                       |
| `OPENCODE_CHAT_MODEL_DEFAULT`            | 可选，默认聊天模型                         |
| `AI_DAILY_REQUESTS_PER_USER`             | 每用户每日 AI 请求上限，`0` 不限           |
| `GITHUB_TOKEN` / `GITHUB_REPO`           | 反馈 → GitHub issue                        |
| `SUPERUSER_EMAIL` / `SUPERUSER_PASSWORD` | 功能建议状态写回；也是 dashboard 账号      |
| `FFMPEG_PATH`                            | 可选，默认 PATH 里的 ffmpeg                |

`mimi-pb` 不需要密钥：`pb_data` 里的数据、超级用户和设置都随目录走。
