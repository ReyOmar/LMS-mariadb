# ══════════════════════════════════════════════════════════
# LMS API — Multi-stage Dockerfile (NestJS + Fastify + SWC)
# Optimized for Render free tier
# ══════════════════════════════════════════════════════════

# ── Stage 1: Install dependencies ─────────────────────────
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm install --omit=dev

# ── Stage 2: Build ────────────────────────────────────────
FROM node:22-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm install
COPY prisma ./prisma
COPY prisma.config.ts ./
RUN npx prisma generate
COPY nest-cli.json tsconfig.json ./
COPY src ./src
RUN npm run build

# ── Stage 3: Production ──────────────────────────────────
FROM node:22-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production

# Create non-root user for security
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nestjs

# Copy production dependencies
COPY --from=deps /app/node_modules ./node_modules

# Copy Prisma client (generated in builder stage)
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma

# Copy Prisma CLI for db push at startup
COPY --from=builder /app/node_modules/prisma ./node_modules/prisma
COPY --from=builder /app/node_modules/.bin/prisma ./node_modules/.bin/prisma

# Copy built application
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma
COPY prisma.config.ts ./
COPY package.json ./

# Create uploads directory (ephemeral on Render free tier)
RUN mkdir -p uploads/certificados && chown -R nestjs:nodejs uploads

USER nestjs

# Render injects PORT automatically; fallback to 3200 for local Docker
EXPOSE ${PORT:-3200}

# Create tables on startup (no-op if already exist), then start app
CMD ["sh", "-c", "npx prisma db push --skip-generate && node dist/main.js"]
