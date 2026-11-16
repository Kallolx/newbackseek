# syntax=docker/dockerfile:1
FROM node:24-bookworm-slim AS dependencies
WORKDIR /app/admin
COPY admin/package.json admin/package-lock.json ./
RUN npm ci
FROM node:24-bookworm-slim AS builder
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=dependencies /app/admin/node_modules ./admin/node_modules
COPY . .
WORKDIR /app/admin
RUN npm run build
FROM node:24-bookworm-slim AS runner
WORKDIR /app/admin
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3001 HOSTNAME=0.0.0.0
RUN groupadd --system --gid 1001 nextjs && useradd --system --uid 1001 --gid nextjs nextjs
COPY --from=builder --chown=nextjs:nextjs /app/public ./public
COPY --from=builder --chown=nextjs:nextjs /app/admin/.next/standalone ./
COPY --from=builder --chown=nextjs:nextjs /app/admin/.next/static ./.next/static
USER nextjs
EXPOSE 3001
CMD ["node", "server.js"]
