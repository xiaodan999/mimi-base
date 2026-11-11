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

## 一、首次部署

### 1. 准备目录和密钥

在服务器上使用仓库 checkout（`/root/mimi-base`）作为 compose 目录：

```bash
cd /root/mimi-base
git pull --ff-only

cp docker/.env.app.example .env.app
chmod 600 .env.app
# 填 PB_URL=http://mimi-pb:8090、OPENCODE_*、GITHUB_*、SUPERUSER_*
```

`pb_data` 直接使用现有的 `pocketbase/pb_data`，不需要建卷或复制。

### 2. 确认 Caddy 网络

```bash
docker network ls | grep caddy-net
docker inspect main-caddy-1 --format '{{range $k,$v := .NetworkSettings.Networks}}{{$k}}{{println}}{{end}}'
```

`compose.yaml` 里的 `caddy-net` 必须和上面一致。Caddy 的配置改在
`/root/main/Caddyfile`，参考 `docker/Caddyfile.example`：

- 删除旧的 `dan-pb` 站点里的 `/db/sync`、`/spa/*`、`/repo/sync`；
- `/db/*` 用 `handle_path` 去掉前缀后转到 `mimi-pb:8090`，保留 `flush_interval -1`；
- `/api/*` 和兜底路径转到 `mimi-app:9001`；
- 保留静态缓存头（或者只靠 app 自己发的头）。

校验并热加载：

```bash
docker exec main-caddy-1 caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
docker exec main-caddy-1 caddy reload  --config /etc/caddy/Caddyfile --adapter caddyfile
```

### 3. 停旧栈、备份、启动

```bash
# 旧的 supervisor 会同时停掉它的 PocketBase 子进程
pkill -f 'pocketbase/server.ts'
sleep 3
ss -ltnp | grep -E ':(8090|9001)' || echo "ports closed"

mkdir -p /root/backups
tar czf "/root/backups/pb_data-pre-container-$(date +%Y%m%d-%H%M%S).tar.gz" \
  -C /root/mimi-base/pocketbase pb_data

cd /root/mimi-base
docker compose config >/dev/null
docker compose up -d
docker compose ps
docker compose logs --tail=50 mimi-pb mimi-app
```

等两个健康检查都通过后，再 `caddy reload`（或先 reload 再启动容器也行，
Caddy 会短暂 502）。

### 4. 挂上 Watchtower

Watchtower 当前按**容器名**监控，并且是 HTTP API 模式（没有
`--http-api-periodic-polls`），所以必须把两个名字加进去，并让 CI 调用它的
更新接口。编辑 `/root/watch-tower/docker-compose.yml`：

```yaml
command: zhengxing-web-app zhengxing-web-staging-app mimi-app mimi-pb --http-api-update
```

```bash
docker compose -f /root/watch-tower/docker-compose.yml up -d
docker logs --tail=30 watch-tower-watchtower-1
```

它已经挂载了 `/root/.docker/config.json`，里面有阿里云 ACR 的登录信息，所以
私有仓库可以直接拉取。

### 5. 冒烟检查

```bash
curl -fsS https://dan-pb.zxvcn.com/api/health
curl -fsS https://dan-pb.zxvcn.com/db/api/health
curl -fsS https://dan-pb.zxvcn.com/version.json
```

浏览器：登录、发一条带图/视频的动态、AI 流式回复、`sandbox_run`、问题反馈。

## 二、日常更新

`master` 推送后：

1. `ci` 通过；
2. `images` 构建并推送 `mimi-base-app` / `mimi-base-pb` 的 `:latest` 和 `:$sha`
   到阿里云 ACR（只有相关路径变化时才构建对应镜像）；
3. `deploy` 调用 Watchtower 的
   `https://zxvcn.com/_watchtower/v1/update?image=...`；
4. Watchtower 拉取并重建对应容器；`deploy` 轮询 `version.json` 确认新 sha。

手动触发（CI 之外的紧急更新）：

```bash
curl -fsS -G \
  -H "Authorization: Bearer $WATCHTOWER_HTTP_API_TOKEN" \
  --data-urlencode "image=registry.cn-guangzhou.aliyuncs.com/xiaohai-huang/mimi-base-app" \
  "https://zxvcn.com/_watchtower/v1/update"
```

**迁移规则**：两个镜像都自动更新，所以 `pb_migrations` 必须只做增量
（新增字段/集合，不删不改语义），应用代码必须能容忍上一个 schema 几秒钟。
需要删字段或重命名时，分两次发布（先加新字段，再删旧字段）。

**回滚**：

```bash
cd /root/mimi-base
MIMI_TAG=<old-sha> docker compose up -d
```

`MIMI_TAG` 是 shell 变量，compose 会用它替换镜像 tag；恢复时去掉它再
`docker compose up -d`。如果这次发布包含破坏性迁移，先停 PB，
从 `/root/backups` 或 `pb_data/backups` 恢复 `pb_data` 再启动。

## 三、备份

PB 的定时备份（Dashboard → Settings → Backups）会把 `pb_data`（含上传文件）
打成 zip 放到 `pb_data/backups/`。在宿主机加一个 cron 把备份拷到别处：

```bash
# /etc/cron.d/mimi-backup
15 3 * * * root rsync -a --delete /root/mimi-base/pocketbase/pb_data/backups/ /root/backups/pb/
```

每天确认一次 `/root/backups/pb/` 有新文件；恢复演练：停 `mimi-pb`，把 zip
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

## 五、清理旧部署（确认稳定 24–48 小时后）

旧 supervisor 的 Docker 沙箱留下了网络、iptables 链和镜像；新沙箱是进程内
QuickJS，这些都不再需要：

```bash
iptables -D INPUT -s 172.31.250.0/24 -j MIMI-SANDBOX-HOST 2>/dev/null || true
iptables -D DOCKER-USER -s 172.31.250.0/24 -j MIMI-SANDBOX 2>/dev/null || true
iptables -F MIMI-SANDBOX 2>/dev/null || true
iptables -X MIMI-SANDBOX 2>/dev/null || true
iptables -F MIMI-SANDBOX-HOST 2>/dev/null || true
iptables -X MIMI-SANDBOX-HOST 2>/dev/null || true
docker network rm mimi-sandbox 2>/dev/null || true
docker images --filter 'reference=mimi-sandbox-*' -q | xargs -r docker rmi

# 旧构建产物和快照；保留 pb_data 和一份最近的 tar 备份
rm -rf /root/mimi-base/build.next /root/mimi-base/pb_data_snapshots
docker builder prune -f
```

保留 `/root/mimi-base` 这个 checkout 作为 compose 目录和回滚参考；旧
`build/` 符号链接和 `mimi-db.log` 可以一并删掉。

## 六、环境变量

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
