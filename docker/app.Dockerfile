# syntax=docker/dockerfile:1
#
# mimi-base-app: Bun API + built SPA + QuickJS sandbox.
# Built by .github/workflows/images.yml and pushed to GitHub Container Registry.

# --- SPA ---------------------------------------------------------------
FROM oven/bun:1.4.4 AS spa
WORKDIR /src
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile
COPY . .
ARG GITHUB_SHA=
ENV VITE_POCKETBASE_URL=same-origin
ENV GITHUB_SHA=$GITHUB_SHA
RUN bun run build

# --- runtime -----------------------------------------------------------
FROM oven/bun:1.4.4
# ffmpeg backs /api/video/compress; curl is the healthcheck; fontconfig serves
# @napi-rs/canvas when ai-files renders scanned PDF pages.
RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      ffmpeg ca-certificates curl fontconfig \
 && fc-cache -f \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY server/package.json server/bun.lock ./server/
RUN cd server && bun install --frozen-lockfile --production
COPY server ./server
COPY lib ./lib
COPY --from=spa /src/build ./build

ENV PB_URL=http://mimi-pb:8090 \
    PORT=9001 \
    STATIC_DIR=/app/build \
    TMPDIR=/tmp

USER bun
EXPOSE 9001

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD curl -fsS http://127.0.0.1:9001/api/health || exit 1

CMD ["bun", "server/main.ts"]
