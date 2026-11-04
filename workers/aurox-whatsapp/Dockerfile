FROM node:22-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends chromium ca-certificates fonts-liberation && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json ./
ENV PUPPETEER_SKIP_DOWNLOAD=1
RUN npm install --omit=dev --no-audit --no-fund
COPY index.mjs ./
RUN mkdir -p /data/aurox-wa && chmod 700 /data/aurox-wa
ENV PORT=3456 DATA_DIR=/data/aurox-wa PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium NODE_ENV=production
EXPOSE 3456
CMD ["node","index.mjs"]
