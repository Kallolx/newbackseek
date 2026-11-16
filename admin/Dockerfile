# syntax=docker/dockerfile:1
FROM node:24-bookworm-slim AS dependencies
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
FROM node:24-bookworm-slim AS builder
ARG NEXT_PUBLIC_TURNSTILE_SITE_KEY
ENV NEXT_PUBLIC_TURNSTILE_SITE_KEY=$NEXT_PUBLIC_TURNSTILE_SITE_KEY
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
# The isolated admin project reuses UI screens from ../src. Install the root
# dependency graph once so both the standalone shell and reused screens resolve
# the same React, Mantine, editor, chart, and icon packages.
COPY --from=dependencies /app/node_modules ./node_modules
COPY . .
WORKDIR /app/admin
RUN npm run build
FROM node:24-bookworm-slim AS runner
WORKDIR /app/admin
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3001 HOSTNAME=0.0.0.0
RUN groupadd --system --gid 1001 nextjs && useradd --system --uid 1001 --gid nextjs nextjs
COPY --from=builder --chown=nextjs:nextjs /app/public ./public
COPY --from=builder --chown=nextjs:nextjs /app/admin/.next/standalone/node_modules ./node_modules
COPY --from=builder --chown=nextjs:nextjs /app/admin/.next/standalone/admin ./
COPY --from=builder --chown=nextjs:nextjs /app/admin/.next/static ./.next/static
USER nextjs
EXPOSE 3001
CMD ["node", "server.js"]
