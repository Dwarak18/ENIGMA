# ══════════════════════════════════════════════════════════════════════════
# ENIGMA Backend – Node.js Express (multi-stage)
# ══════════════════════════════════════════════════════════════════════════

FROM node:20-alpine AS builder

WORKDIR /build

COPY package*.json ./
RUN npm install --legacy-peer-deps

FROM node:20-alpine

LABEL org.opencontainers.image.title="enigma-backend-node" \
      org.opencontainers.image.description="ENIGMA entropy verification and AES encryption backend with Node.js Express"

WORKDIR /app

# Copy node_modules from builder
COPY --from=builder /build/node_modules ./node_modules
COPY package*.json ./
COPY src ./src

# Create a non-root user for security
RUN addgroup -S enigma && adduser -S enigma -G enigma
RUN chown -R enigma:enigma /app
USER enigma

EXPOSE 3000

# Basic health check
HEALTHCHECK --interval=15s --timeout=5s --start-period=30s --retries=3 \
    CMD node -e "fetch('http://127.0.0.1:3000/health').then(r => r.ok ? process.exit(0) : process.exit(1)).catch(() => process.exit(1))"

CMD ["npm", "start"]
