# syntax=docker/dockerfile:1
FROM node:22-alpine

ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=4173

WORKDIR /app

# 先只拷贝依赖清单（本项目无第三方依赖，主要为利用构建缓存）
COPY package.json ./
COPY server.mjs ./
COPY server ./server
COPY index.html ./
COPY assets ./assets

RUN mkdir -p /app/data /app/logs \
  && chown -R node:node /app/data /app/logs

USER node

VOLUME ["/app/data", "/app/logs"]
EXPOSE 4173

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||4173)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "--no-warnings", "server.mjs"]
