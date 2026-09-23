# PropChain Backend – production Docker image (#1175)
#
# Multi-stage build:
#   1. builder  – installs dependencies, generates the Prisma client, builds dist
#   2. runtime  – slim Node 20 alpine image, non-root user, runs `node dist/main`
#
# Migrations run via docker-entrypoint.sh before the app starts.

# ---------- Build stage ----------
FROM node:20-alpine AS builder

WORKDIR /app

# Install dependencies first to leverage Docker layer caching.
COPY package.json package-lock.json ./
RUN npm ci

# The Prisma client needs the schema before it can be generated.
COPY prisma ./prisma
RUN npx prisma generate

# Copy the rest of the source and build the production bundle.
COPY . .
RUN npm run build && chmod +x docker-entrypoint.sh

# ---------- Runtime stage ----------
FROM node:20-alpine AS runtime

ENV NODE_ENV=production
WORKDIR /app

# Run as a non-root user for security.
RUN addgroup -g 1001 -S nodejs \
    && adduser -S nodejs -u 1001 -G nodejs

COPY --from=builder --chown=nodejs:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=nodejs:nodejs /app/dist ./dist
COPY --from=builder --chown=nodejs:nodejs /app/prisma ./prisma
COPY --from=builder --chown=nodejs:nodejs /app/package.json ./package.json
COPY --from=builder --chown=nodejs:nodejs /app/docker-entrypoint.sh ./docker-entrypoint.sh

USER nodejs

EXPOSE 3000

# Liveness probe – GET /healthz returns 200 while the process is running.
HEALTHCHECK --interval=30s --timeout=3s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/healthz').then((r) => (r.ok ? process.exit(0) : process.exit(1))).catch(() => process.exit(1))"

ENTRYPOINT ["./docker-entrypoint.sh"]