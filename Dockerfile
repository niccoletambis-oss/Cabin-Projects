# syntax=docker/dockerfile:1
# No application secrets are used at build time. Inject production env at runtime.
FROM node:24-bookworm-slim AS base
RUN --mount=type=secret,id=system_ca \
    set -eu; \
    cabin_apt() { if [ -f /run/secrets/system_ca ]; then apt-get -o Acquire::https::CaInfo=/run/secrets/system_ca "$@"; else apt-get "$@"; fi; }; \
    cabin_apt update; DEBIAN_FRONTEND=noninteractive cabin_apt install -y --no-install-recommends openssl ca-certificates; \
    rm -rf /var/lib/apt/lists/*
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
FROM base AS dependencies
COPY package.json package-lock.json ./
COPY prisma ./prisma
COPY prisma.config.ts ./
COPY src/lib/environment.ts src/lib/prisma-url.ts ./src/lib/
RUN --mount=type=secret,id=proxy_ca \
    if [ -f /run/secrets/proxy_ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/proxy_ca; fi; DATABASE_URL=postgresql://build:build@127.0.0.1:5432/build npm ci --strict-ssl=true
FROM base AS build
COPY --from=dependencies /app/node_modules ./node_modules
COPY . .
ENV APP_ENV=development DATABASE_URL=postgresql://build:build@127.0.0.1:5432/build
RUN npm run build
FROM base AS runner
ENV NODE_ENV=production APP_ENV=production HOSTNAME=0.0.0.0 PORT=3000
RUN groupadd --system --gid 1001 cabin && useradd --uid 1001 --gid cabin --no-create-home cabin
COPY --from=build --chown=cabin:cabin /app/.next/standalone ./
COPY --from=build --chown=cabin:cabin /app/.next/static ./.next/static
COPY --from=build --chown=cabin:cabin /app/public ./public
USER cabin
EXPOSE 3000
CMD ["node", "runtime-entry.mjs"]
