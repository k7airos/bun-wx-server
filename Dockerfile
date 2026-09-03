FROM oven/bun:1@sha256:18639686662e5cd8a963ffb967dd130034a2a2d076a52e65dfd4fe18f75cc038 AS builder

WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile
COPY . .
RUN bun test tests/unit.test.ts \
  && bun test tests/service.test.ts \
  && bun src/index.ts --help \
  && bun src/index.ts check-config
RUN bun run build:binary

FROM debian:bookworm-slim@sha256:5ae3c39ebd15e229dcedd5cee596b2497182493d41ff162e824ba13fc1b2b867

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
