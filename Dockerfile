FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=8080
ENV DATA_DIR=/data
ENV DB_PATH=/data/webosu.db
COPY server/package.json ./server/package.json
RUN cd server && npm install --omit=dev --no-audit --no-fund
COPY . .
EXPOSE 8080
CMD ["node", "server/index.js"]
