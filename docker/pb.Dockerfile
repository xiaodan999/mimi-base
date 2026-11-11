# syntax=docker/dockerfile:1
#
# mimi-base-pb: PocketBase + the committed schema and JSVM hooks.
# The binary is statically linked; Alpine is enough.

FROM alpine:3.22 AS fetch
ARG PB_VERSION=0.40.6
ARG TARGETARCH=amd64
RUN apk add --no-cache curl unzip \
 && curl -fsSL -o /tmp/pb.zip \
      "https://github.com/pocketbase/pocketbase/releases/download/v${PB_VERSION}/pocketbase_${PB_VERSION}_linux_${TARGETARCH}.zip" \
 && mkdir -p /out \
 && unzip -o /tmp/pb.zip -d /out pocketbase \
 && chmod +x /out/pocketbase

FROM alpine:3.22
RUN apk add --no-cache ca-certificates tzdata wget
COPY --from=fetch /out/pocketbase /pocketbase
COPY pocketbase/pb_migrations /pb_migrations
COPY pocketbase/pb_hooks /pb_hooks
COPY docker/pb-entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

EXPOSE 8090
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD wget -qO- http://127.0.0.1:8090/api/health >/dev/null || exit 1

ENTRYPOINT ["/entrypoint.sh"]
