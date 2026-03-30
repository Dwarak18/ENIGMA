# ── ENIGMA Frontend – React/Vite → Nginx ─────────────────────────────────

# ── Stage 1: Build ────────────────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# VITE_BACKEND_URL is intentionally empty so the app uses the Nginx proxy
# at the same origin (no CORS, no hardcoded host).
RUN VITE_BACKEND_URL= npm run build

# ── Stage 2: Serve with Nginx ─────────────────────────────────────────────
FROM nginx:stable-alpine

# Replace the default Nginx config with our SPA + proxy config
COPY nginx-spa.conf /etc/nginx/conf.d/default.conf

# Copy built assets from the builder stage
COPY --from=builder /app/dist /usr/share/nginx/html

EXPOSE 80

HEALTHCHECK --interval=15s --timeout=5s --start-period=10s --retries=3 \
    CMD wget -qO- http://127.0.0.1/ping || exit 1

CMD ["nginx", "-g", "daemon off;"]
