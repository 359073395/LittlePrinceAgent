# 小王子 Agent 云部署指南

将小王子 Agent 部署到云服务器，手机通过 PWA 随时随地连接使用。

## 架构

```
[手机 Safari/Chrome] --HTTPS--> [Nginx :443]
                                     |
                                [Node.js :3721]
                                     |
                                SQLite + Cloud APIs
```

## 前置要求

- Linux VPS（推荐 Ubuntu 22.04+，最低 2GB 内存）
- 域名已解析到服务器 IP
- Node.js 20+

---

## 一、一键部署（Ubuntu）

```bash
# 1. 安装依赖
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs git nginx python3 python3-pip build-essential certbot python3-certbot-nginx

# 2. 克隆项目
git clone https://github.com/359073395/LittlePrinceAgent.git /opt/littleprince-agent
cd /opt/littleprince-agent

# 3. 安装依赖
npm ci --omit=dev

# 4. 配置环境变量
cp .env.example .env
nano .env   # 填入你的 LLM API Key 等配置

# 5. 安装 PM2 进程管理
npm install -g pm2
pm2 start ecosystem.config.cjs
pm2 save
sudo env PATH=$PATH:/usr/bin pm2 startup systemd -u $(whoami) --hp /home/$(whoami)

# 6. 配置 Nginx 反向代理
sudo cp deploy/nginx.conf /etc/nginx/sites-available/littleprince-agent
sudo ln -s /etc/nginx/sites-available/littleprince-agent /etc/nginx/sites-enabled/
# 编辑域名：sudo nano /etc/nginx/sites-available/littleprince-agent
# 将 your-domain.com 替换为你的实际域名

# 7. 申请 SSL 证书
sudo certbot --nginx -d your-domain.com

# 8. 重启 nginx
sudo nginx -s reload

# 9. 查看运行状态
pm2 status
pm2 logs littleprince-agent
```

## 二、激活

1. 浏览器打开 `https://你的域名/activation`
2. 输入 LLM API Key（如 DeepSeek / MiniMax / OpenAI）
3. 提交后后端自动启动主循环
4. 打开 `https://你的域名/brain-ui` 开始使用

## 三、手机安装 PWA

### Android（Chrome）
1. 打开 `https://你的域名/brain-ui`
2. 点菜单 → "添加到主屏幕"
3. 全屏运行，无浏览器栏

### iOS（Safari）
1. 打开 `https://你的域名/brain-ui`
2. 点分享按钮 → "添加到主屏幕"
3. 图标出现在桌面，打开即全屏

### PWA 功能
- 离线缓存 UI（内容在线获取）
- 语音输入（手机麦克风 → 云端 ASR）
- 通知推送（预留，需额外配置）

## 四、Docker 部署（可选）

```bash
docker build -t littleprince-agent .
docker run -d \
  --name littleprince-agent \
  -p 127.0.0.1:3721:3721 \
  -v /etc/littleprince-agent:/etc/littleprince-agent \
  -v /var/lib/littleprince-agent:/var/lib/littleprince-agent \
  --restart unless-stopped \
  littleprince-agent
```

## 五、更新

```bash
cd /opt/littleprince-agent
git pull
npm ci --omit=dev
pm2 restart littleprince-agent
```

## 六、安全建议

1. 在 `.env` 中设置 `LITTLE_PRINCE_AGENT_API_TOKEN` 启用令牌认证
2. 确保 nginx 仅暴露 443 端口（80 自动跳转 HTTPS）
3. 定期更新：`sudo apt update && sudo apt upgrade`
4. 监控日志：`pm2 logs littleprince-agent`

## 七、故障排查

| 问题 | 检查 |
|------|------|
| 502 Bad Gateway | `pm2 status` 检查后端是否运行 |
| WebSocket 连不上 | nginx 配置需包含 `proxy_set_header Upgrade` 和 `Connection "upgrade"` |
| SSE 断连 | nginx `proxy_read_timeout` 需设为较长值（已配置 86400s） |
| 语音不工作 | 检查 ASR/TTS 配置，控制台查看 WebSocket 连接状态 |
| 激活页面打不开 | 检查 `.env` 中 `LITTLE_PRINCE_AGENT_HOST` 是否为 `127.0.0.1` |
