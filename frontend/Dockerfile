# ── Build stage ────────────────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app
COPY package*.json ./
RUN npm ci

COPY . .
# Pass backend URL at build time if needed:
# ARG VITE_BACKEND_URL
ENV VITE_BACKEND_URL=""
RUN npm run build

# ── Serve stage ────────────────────────────────────────────────────────
FROM nginx:1.25-alpine

# Remove default nginx content
RUN rm -rf /usr/share/nginx/html/*

COPY --from=builder /app/dist /usr/share/nginx/html

# SPA routing: serve index.html for all non-file routes
COPY nginx-spa.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
