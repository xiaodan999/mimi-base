# 安全策略

本项目是个人自用的 PWA（秘密基地），并非面向公众的开放服务。如发现安全问题，
请通过 GitHub 私有 issue 或直接联系仓库维护者反馈，不要在公开场合披露细节。

## 支持范围

| 版本                 | 是否受支持 |
| -------------------- | ---------- |
| `master`（当前部署） | 是         |
| 历史提交             | 否         |

## 报告漏洞

- 说明复现步骤、影响范围和可能的修复建议。
- 请勿在报告中包含真实的账号密码、AI Provider API Key 或 PocketBase
  超级管理员凭据。
- 维护者确认后会尽快修复并部署；修复发布前不会公开细节。

## 敏感信息约定

- `.env` / `.env.prod` 永不提交；`VITE_POCKETBASE_URL` 在前端属于公开值。
- AI Provider 的密钥只保存在浏览器 localStorage，只发往 Provider，绝不写入
  PocketBase。
- PocketBase 数据集合均要求登录（`@request.auth.id != ""`），文件字段为
  protected。
