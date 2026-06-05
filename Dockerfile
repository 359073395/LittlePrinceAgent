# 小王子 Agent — Dockerfile（多阶段构建，生产就绪）
# 构建：docker build -t littleprince-agent .
# 运行：docker run -d --name littleprince-agent -p 3721:3721 -v /path/to/data:/var/lib/littleprince-agent --restart unless-stopped littleprince-agent

FROM node:20-slim AS base

RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    python3-pip \
    build-essential \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Build phase
FROM base AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production --ignore-scripts 2>&1
RUN npx node-gyp rebuild -C node_modules/better-sqlite3 2>&1 || \
    (cd node_modules/better-sqlite3 && npx node-gyp rebuild 2>&1)

# Runtime phase
FROM base AS runtime
WORKDIR /app

RUN groupadd -r app && useradd -r -g app app && \
    mkdir -p /var/lib/littleprince-agent/data /var/lib/littleprince-agent/sandbox && \
    chown -R app:app /var/lib/littleprince-agent

COPY --from=build /app/node_modules ./node_modules
COPY package.json ./
COPY src/ ./src/
COPY brain-ui.html activation.html systemPrompt.html manifest.json sw.js index.html ./
COPY images/logo.png images/AGI128k.jpg images/icon-192.png images/icon-512.png ./images/
COPY sandbox/ ./sandbox/
COPY music/ ./music/

USER app
ENV LITTLE_PRINCE_AGENT_HOST=127.0.0.1
ENV LITTLE_PRINCE_AGENT_PORT=3721
ENV LITTLE_PRINCE_AGENT_SKIP_DESKTOP_SCAN=1
ENV LITTLE_PRINCE_AGENT_SKIP_SOFTWARE_SCAN=1
ENV LITTLE_PRINCE_AGENT_SKIP_LOCAL_RESOURCES_SCAN=1

EXPOSE 3721
VOLUME ["/var/lib/littleprince-agent"]
CMD ["node", "--env-file=/etc/littleprince-agent/.env", "src/index.js"]
