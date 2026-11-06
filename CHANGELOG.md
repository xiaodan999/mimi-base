# 更新日志

本文件记录面向使用者的主要变更，格式参考 Keep a Changelog。

## [未发布]

### 新增

- 新增 `components.json`、依赖自动更新配置与安全 / 贡献文档。
- 预提交钩子增加 `lint`、`format:check`、`typecheck:tsc` 校验。

### 修复

- PWA 在 iOS 上补齐 `viewport-fit=cover`，主题色随深浅色模式同步。
- 交互控件补充 `active:` 反馈，加载 / 错误状态补齐无障碍语义。
- 移除未使用的依赖与 shadcn 原语。

### 变更

- `bun test` 现在覆盖整个仓库，而不再只扫描 `app/`、`lib/`。
- `bun.lock` 的下载地址统一为默认 npm 源。

## [0.0.1]

- 首个版本：动态、记账、学习、年度报告与 AI 辅助功能。
