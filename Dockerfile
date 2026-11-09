# ---------- stage 1: build the React UI ----------
FROM node:20-bookworm-slim AS web
WORKDIR /web
COPY web/package.json web/package-lock.json ./
RUN npm ci
COPY web/ ./
RUN npm run build

# ---------- stage 2: API + built UI ----------
FROM node:20-bookworm-slim
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=8787 \
    STATIC_NEW=/app/web/dist \
    STATIC_CLASSIC=/app/classic
WORKDIR /app/server
COPY server/package.json server/package-lock.json ./
RUN npm ci --omit=dev
COPY server/ ./
COPY --from=web /web/dist /app/web/dist
RUN mkdir -p /app/classic \
 && echo '<!doctype html><meta http-equiv="refresh" content="0;url=/new/"><a href="/new/">Open ZAMIL</a>' > /app/classic/index.html
USER node
EXPOSE 8787
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8787)+'/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["sh","-c","node migrate.js && node src/server.js"]
