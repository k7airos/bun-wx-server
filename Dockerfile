FROM oven/bun:1 AS builder

WORKDIR /app
COPY . .
RUN bun run check
RUN bun run build:binary

FROM debian:bookworm-slim

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
