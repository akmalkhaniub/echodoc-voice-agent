#!/usr/bin/env bash
# ==============================================================================
# Google Cloud Run Deployment Script for EchoDoc Clinical Voice Agent
# Target: Fully managed Serverless Google Cloud Run via Google Artifact Registry
# ==============================================================================
set -euo pipefail

GCP_PROJECT_ID="${GCP_PROJECT_ID:-$(gcloud config get-value project)}"
GCP_REGION="${GCP_REGION:-us-central1}"
SERVICE_NAME="echodoc-voice-agent"
IMAGE_URI="${GCP_REGION}-docker.pkg.dev/${GCP_PROJECT_ID}/cloud-run-source-deploy/${SERVICE_NAME}:latest"

echo "🚀 [GCP Deploy] Deploying EchoDoc Voice Agent to Google Cloud Run (${GCP_REGION})..."

# 1. Build and push image using Google Cloud Build
echo "🔨 Building and pushing image with Google Cloud Build..."
gcloud builds submit --tag "${IMAGE_URI}" .

# 2. Deploy to Cloud Run
echo "☁️ Deploying container to Cloud Run..."
gcloud run deploy "${SERVICE_NAME}" \
  --image "${IMAGE_URI}" \
  --region "${GCP_REGION}" \
  --platform managed \
  --allow-unauthenticated \
  --port 8080 \
  --timeout 3600 \
  --concurrency 80 \
  --cpu 1 \
  --memory 1Gi \
  --set-env-vars NODE_ENV=production,PORT=8080

echo "✅ Deployment successful! Service URL:"
gcloud run services describe "${SERVICE_NAME}" --platform managed --region "${GCP_REGION}" --format 'value(status.url)'
