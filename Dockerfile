# ==============================================================================
# Multi-Cloud Production Dockerfile for EchoDoc Clinical Voice Agent
# Compatible with: AWS App Runner / ECS, Google Cloud Run, Azure Container Apps,
# and Kubernetes (EKS / GKE / AKS).
# ==============================================================================

# Stage 1: Dependency resolution & build cache
FROM node:22-alpine AS dependencies
WORKDIR /app

# Install build dependencies if needed
RUN apk add --no-cache libc6-compat

COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts

# Stage 2: Minimal, secure production runtime
FROM node:22-alpine AS runner
WORKDIR /app

# Set production environment
ENV NODE_ENV=production
ENV PORT=3000

# Copy node modules from dependencies stage
COPY --from=dependencies /app/node_modules ./node_modules
COPY package.json ./

# Copy application source code & public dashboard
COPY src/ ./src/

# Run as non-root unprivileged node user
USER node

# Expose standard container port (can be overridden via PORT env var in GCP/AWS/Azure)
EXPOSE 3000

# Universal healthcheck probe (works natively with Docker, K8s, and cloud orchestrators)
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget -qO- http://127.0.0.1:${PORT:-3000}/api/health || exit 1

# Start the clinical voice agent server
CMD ["node", "src/server.js"]
