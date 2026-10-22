# 多架构构建要点：
#   1. 基础镜像固定到「多架构 index」的 digest，单架构 manifest 只能构建一种架构。
#   2. 构建阶段跑在宿主架构（--platform=$BUILDPLATFORM），产物再交叉编译到目标架构，
#      避免整段 bun install / bun test 在模拟器里跑。
#   3. bun build --compile 必须显式指定 --target，否则编出来的是宿主架构二进制。

FROM --platform=$BUILDPLATFORM oven/bun:1@sha256:1d22548f177f4ff38e0c15baa3c2c46c6c2060ba2d1bc573bb4720b407548f1d AS builder

ARG TARGETARCH

WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile
COPY . .
RUN bun test tests/unit.test.ts \
  && bun test tests/service.test.ts \
  && bun src/index.ts --help \
  && bun src/index.ts check-config
RUN case "$TARGETARCH" in \
      amd64) bun_target="bun-linux-x64" ;; \
      arm64) bun_target="bun-linux-arm64" ;; \
      *) echo "unsupported TARGETARCH: $TARGETARCH" >&2; exit 1 ;; \
    esac \
    && mkdir -p dist \
    && bun build ./src/index.ts --compile --target="$bun_target" --outfile ./dist/blog-wx-bun-service

FROM debian:bookworm-slim@sha256:7ff6ba31527b9e336162fa061746c366c4b2032f4d2cff2078bea43f78efe3f8

WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates libstdc++6 \
  && rm -rf /var/lib/apt/lists/*

COPY --from=builder /app/dist/blog-wx-bun-service /usr/local/bin/blog-wx-bun-service

ENV NODE_ENV=production
ENV PORT=3001
ENV DATABASE_PATH=/data/app.sqlite

VOLUME ["/data"]
EXPOSE 3001

ENTRYPOINT ["/usr/local/bin/blog-wx-bun-service", "serve"]
