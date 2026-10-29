# syntax=docker/dockerfile:1
# No application secrets are used at build time. Inject production env at runtime.
FROM node:24-bookworm-slim AS base
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
FROM base AS dependencies
COPY package.json package-lock.json ./
COPY prisma ./prisma
COPY prisma.config.ts ./
RUN --mount=type=secret,id=proxy_ca \
    if [ -f /run/secrets/proxy_ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/proxy_ca; fi; DATABASE_URL=postgresql://build:build@127.0.0.1:5432/build npm ci --strict-ssl=true
FROM base AS build
COPY --from=dependencies /app/node_modules ./node_modules
COPY . .
ENV APP_ENV=development DATABASE_URL=postgresql://build:build@127.0.0.1:5432/build
RUN npm run build
FROM base AS runner
ENV NODE_ENV=production APP_ENV=production HOSTNAME=0.0.0.0 PORT=3000
RUN groupadd --system --gid 1001 cabin && useradd --system --uid 1001 --gid cabin cabin
COPY --from=build --chown=cabin:cabin /app/.next/standalone ./
COPY --from=build --chown=cabin:cabin /app/.next/static ./.next/static
COPY --from=build --chown=cabin:cabin /app/public ./public
USER cabin
EXPOSE 3000
CMD ["node", "server.js"]
