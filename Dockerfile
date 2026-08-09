# webosu — full-stack on Fly.io alone (single Node process + mounted volume).
# Multi-stage: builder installs deps + builds the Vite frontend to dist/;
# runtime ships only dist/ + the server + its prod deps (no vite/source/devDeps).

# ---- builder ----
FROM node:22-slim AS builder
WORKDIR /app
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
COPY package.json package-lock.json* ./
COPY server/package.json server/package-lock.json* ./server/
RUN if [ -f package-lock.json ]; then npm ci --no-audit --no-fund; else npm install --no-audit --no-fund; fi && cd server && if [ -f package-lock.json ]; then npm ci --omit=dev --no-audit --no-fund; else npm install --omit=dev --no-audit --no-fund; fi
COPY . .
RUN npm run build

# ---- runtime ----
FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=8080
ENV DATA_DIR=/data
ENV DB_PATH=/data/webosu.db
COPY --from=builder /app/server ./server
COPY --from=builder /app/dist ./dist
EXPOSE 8080
CMD ["node", "server/index.js"]
