# 参与开发

这是一个个人项目，但欢迎按下面的约定贡献。

## 环境准备

```bash
bun install
cp .env.example .env

# 终端 1：PocketBase + API
bun run dev:backend

# 终端 2：Vite，默认 3000
bun run dev:frontend
```

## 分支与工作流

- 每个功能在自己的 worktree 中开发（见 `AGENTS.md` 的 Worktrees 一节），
  `master` 始终保持可部署。
- 提交前会运行 `.githooks/pre-commit`（用 `bun run setup:hooks` 启用一次）：
  `bun fmt --staged`、`bun run typecheck`、`bun run test`、`bun run lint`、
  `bun run format:check`。
- 提交信息使用 conventional commits（如 `feat: ...`、`fix: ...`）。

## 代码约定

- UI 文案使用中文；样式优先用 Tailwind 语义类与 `components/ui` 原语。
- 格式化用 `bun fmt`（含 Tailwind 类名与 import 排序），lint 用 `biome`，
  类型检查用 `bun check`（`bun run typecheck`）。
- `components/ui/` 下的部分是手工改造过的 fork，重新生成前务必阅读
  `AGENTS.md` 并重新套用改造。
- 数据集合与过滤器规则见 `AGENTS.md` 的 Backend / data rules 一节。

## 验证

```bash
bun run typecheck
bun run test
bun run lint
bun run format:check
bun run build
```
