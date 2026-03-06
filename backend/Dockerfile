# ── ENIGMA Backend – Node.js ─────────────────────────────────────────────
FROM node:20-alpine

LABEL org.opencontainers.image.title="enigma-backend"
LABEL org.opencontainers.image.description="ENIGMA entropy verification backend"

# Install dumb-init for proper PID 1 signal handling
RUN apk add --no-cache dumb-init

WORKDIR /app

# Install production dependencies first (cache layer)
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# Copy application source
COPY src/ ./src/

# Non-root user for security
RUN addgroup -S enigma && adduser -S enigma -G enigma
USER enigma

EXPOSE 3000

# Healthcheck: ping the /health endpoint
HEALTHCHECK --interval=15s --timeout=5s --start-period=30s --retries=3 \
    CMD wget -qO- http://127.0.0.1:3000/health || exit 1

ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "src/index.js"]
