# 小王子 Agent 云端网页版

本文档描述第一阶段的云端网页版：单用户、私有部署、浏览器访问，保留核心 Agent/记忆/Brain UI 能力，同时默认关闭本机特权能力。

## 运行方式

设置环境变量后启动：

```bash
LITTLE_PRINCE_AGENT_MODE=cloud \
LITTLE_PRINCE_AGENT_HOST=0.0.0.0 \
LITTLE_PRINCE_AGENT_PORT=3721 \
LITTLE_PRINCE_AGENT_API_TOKEN=replace-with-a-long-random-token \
npm run start:web
```

如果部署在域名或 HTTPS 反向代理后面，建议额外设置公网地址，下载按钮和 Linux 一键安装命令会使用它：

```bash
LITTLE_PRINCE_AGENT_PUBLIC_URL=https://agent.example.com
```

Windows PowerShell 示例：

```powershell
$env:LITTLE_PRINCE_AGENT_MODE="cloud"
$env:LITTLE_PRINCE_AGENT_HOST="0.0.0.0"
$env:LITTLE_PRINCE_AGENT_PORT="3721"
$env:LITTLE_PRINCE_AGENT_API_TOKEN="replace-with-a-long-random-token"
npm run start:web
```

首次访问：

```text
https://your-domain.example/brain-ui?token=replace-with-a-long-random-token
```

服务端会把 token 写入 `lp_agent_token` HttpOnly cookie，之后同域的 API、SSE、WebSocket 请求会自动带 cookie。

如果站点跑在 HTTPS 后面，可以加：

```bash
LITTLE_PRINCE_AGENT_SECURE_COOKIE=true
```

## Cloud Mode 默认关闭的能力

`LITTLE_PRINCE_AGENT_MODE=cloud` 默认关闭这些本机/服务器特权能力：

- 服务器系统信息注入
- 桌面快捷方式扫描
- 已安装软件扫描
- 本地 SSH/Git 资源扫描
- 本地 AI Agent 扫描与委派
- Shell/进程工具：`exec_command`、`kill_process`、`list_processes`
- 插件安装/卸载
- 本地应用控制、微信扫码本地连接器等桌面能力

如确实是单租户可信服务器，可按需显式打开：

```bash
LITTLE_PRINCE_AGENT_ENABLE_HOST_CONTEXT=true
LITTLE_PRINCE_AGENT_ENABLE_GEO_WEATHER=true
LITTLE_PRINCE_AGENT_ENABLE_SHELL_TOOLS=true
LITTLE_PRINCE_AGENT_ENABLE_LOCAL_PRIVILEGED_TOOLS=true
```

不建议在公网多用户环境打开这些能力。

## 当前保留的核心能力

- Brain UI 网页端
- HTTP API
- SSE 实时事件流
- ACUI WebSocket
- 云端 ASR WebSocket 代理
- LLM Provider 配置
- 记忆系统 SQLite/FTS5
- 热点、人物卡片、文档面板
- 社交 Webhook
- 文件沙盒内的读写工具

## 客户端下载中转

云端网页不会让用户浏览器直接访问 GitHub 下载 Windows 客户端。页面上的“Windows 桌面版”按钮指向本服务的公开下载端点：

```text
/downloads/windows
```

第一次访问时，服务器会按以下顺序找到 Windows 安装包：

1. 如果设置了 `LITTLE_PRINCE_AGENT_WINDOWS_DOWNLOAD_URL` 且它是 `.exe` 或 `.msi` 直链，直接使用该地址。
2. 否则读取 GitHub latest release API，选择 `.exe` / `.msi` 安装包资产。

安装包会缓存到：

```text
<LITTLE_PRINCE_AGENT_USER_DIR>/data/downloads/
```

后续用户都从你的服务器下载缓存文件，不再直连 GitHub。这样国内网络环境下，只要服务器能拉到 GitHub Release，用户本地就能稳定下载。缓存目录在同一服务器上，更新 Release 后第一次访问会按新的 Release 资产重新缓存。

Linux 一键安装脚本由服务器直接提供：

```text
/downloads/linux-install.sh
```

部署完成后可在服务器上使用：

```bash
curl -fsSL http://SERVER_IP:3721/downloads/linux-install.sh | bash
```

如果已经配置 `LITTLE_PRINCE_AGENT_PUBLIC_URL`，页面返回的命令会自动换成对应域名。

## 多用户 SaaS 还需要的改造

当前第一阶段是单用户私有云端版，不是完整多租户 SaaS。要做多用户，需要继续完成：

- 登录/注册/OAuth
- user_id 贯穿 API、SSE、WebSocket、数据库
- 每用户独立配置、API Key、记忆、沙盒、媒体历史
- 数据库从单 SQLite 迁到 PostgreSQL，或至少每用户独立 SQLite
- 后台任务按用户隔离
- 管理后台与审计日志
- 上传、文件、工具执行的租户级权限模型
- 反向代理 HTTPS、限流、备份和密钥加密

## 推荐部署形态

第一阶段推荐：

- 单台 VPS 或内网服务器
- Node.js 18+
- 反向代理：Nginx/Caddy
- HTTPS
- `LITTLE_PRINCE_AGENT_API_TOKEN` 使用 32 字节以上随机值
- 数据目录挂载到持久磁盘：`LITTLE_PRINCE_AGENT_USER_DIR=/data/littleprince-agent`
