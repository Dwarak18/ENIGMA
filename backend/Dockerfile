# ── Build stage ───────────────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev

# ── Runtime stage ─────────────────────────────────────────────────────
FROM node:20-alpine

RUN apk add --no-cache dumb-init

WORKDIR /app

# Copy production dependencies from builder
COPY --from=builder /app/node_modules ./node_modules
# Copy source
COPY src ./src
COPY package.json ./

# Non-root user
RUN addgroup -S enigma && adduser -S enigma -G enigma
USER enigma

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:3000/health || exit 1

ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "src/index.js"]
