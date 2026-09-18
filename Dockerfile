# ==============================================================================
# Multi-Cloud Production Dockerfile for EchoDoc Clinical Voice Agent (TypeScript)
# Compatible with: AWS App Runner / ECS, Google Cloud Run, Azure Container Apps,
# and Kubernetes (EKS / GKE / AKS).
# ==============================================================================

# Stage 1: Install ALL deps and compile TypeScript -> dist/
FROM node:22-alpine AS build
WORKDIR /app
RUN apk add --no-cache libc6-compat
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json ./
COPY scripts/ ./scripts/
COPY src/ ./src/
RUN npm run build

# Stage 2: Install production-only deps
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts

# Stage 3: Minimal, secure production runtime
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000

COPY --from=deps /app/node_modules ./node_modules
COPY package.json ./
# Compiled JS + copied public assets
COPY --from=build /app/dist ./dist

USER node
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget -qO- http://127.0.0.1:${PORT:-3000}/api/health || exit 1

CMD ["node", "dist/server.js"]
