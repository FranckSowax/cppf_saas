# ============================================
# CPPF WhatsApp Connect - Production Dockerfile
# Architecture: Node.js Express + Prisma ORM
# Sert le frontend (index.html) + API backend
# ============================================

FROM node:20-alpine AS builder

WORKDIR /app

# Installer les dependances
COPY backend/package*.json ./backend/
RUN cd backend && npm ci --production=false

# Copier le code backend + schema Prisma
COPY backend/ ./backend/

# Generer le client Prisma
RUN cd backend && npx prisma generate

# ============================================
# Image de production
# ============================================
FROM node:20-alpine

RUN apk add --no-cache curl tini

WORKDIR /app

# Copier les dependances et le client Prisma genere
COPY --from=builder /app/backend/node_modules ./backend/node_modules
COPY --from=builder /app/backend/src ./backend/src
COPY --from=builder /app/backend/prisma ./backend/prisma
COPY --from=builder /app/backend/package.json ./backend/package.json

# Copier le frontend (SPA statique)
COPY index.html ./index.html
COPY public/ ./public/

# Port expose
ENV PORT=3000
ENV NODE_ENV=production
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=5s --retries=3 --start-period=15s \
  CMD curl -f http://localhost:3000/api/health || exit 1

# Demarrage avec tini (gestion propre des signaux)
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "backend/src/server.js"]
