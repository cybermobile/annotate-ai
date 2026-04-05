FROM node:22-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    openssl \
    libnss3 libatk1.0-0 libatk-bridge2.0-0 libcups2 libgbm1 \
    libasound2 libpangocairo-1.0-0 libxss1 libgtk-3-0 \
    libxshmfence1 libglu1-mesa chromium \
    && rm -rf /var/lib/apt/lists/*

ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV CHROMIUM_PATH=/usr/bin/chromium

RUN corepack enable && corepack prepare pnpm@10.4.1 --activate

WORKDIR /app

COPY package.json pnpm-lock.yaml ./
COPY patches ./patches/
RUN pnpm install --frozen-lockfile

COPY . .
RUN NODE_ENV=development pnpm run build

RUN mkdir -p /app/uploads

ENV NODE_ENV=production
EXPOSE 3000

CMD ["node", "dist/index.js"]
