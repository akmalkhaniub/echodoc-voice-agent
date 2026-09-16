#!/usr/bin/env bash
# ==============================================================================
# Azure Container Apps Deployment Script for EchoDoc Clinical Voice Agent
# Target: Azure Container Apps (ACA) with Azure Container Registry (ACR)
# ==============================================================================
set -euo pipefail

RESOURCE_GROUP="${RESOURCE_GROUP:-echodoc-rg}"
LOCATION="${LOCATION:-eastus}"
ENVIRONMENT_NAME="${ENVIRONMENT_NAME:-echodoc-env}"
APP_NAME="${APP_NAME:-echodoc-voice-agent}"

echo "🚀 [Azure Deploy] Deploying EchoDoc Voice Agent to Azure Container Apps..."

# 1. Ensure resource group and Container Apps environment exist
az group create --name "${RESOURCE_GROUP}" --location "${LOCATION}" -o table || true
az containerapp env create --name "${ENVIRONMENT_NAME}" --resource-group "${RESOURCE_GROUP}" --location "${LOCATION}" -o table || true

# 2. Build and deploy container directly using 'az containerapp up'
echo "🔨 Building container and deploying to Azure Container Apps..."
az containerapp up \
  --name "${APP_NAME}" \
  --resource-group "${RESOURCE_GROUP}" \
  --environment "${ENVIRONMENT_NAME}" \
  --source . \
  --target-port 3000 \
  --ingress external \
  --env-vars NODE_ENV=production PORT=3000

echo "✅ Azure Container App deployed successfully!"
az containerapp show --name "${APP_NAME}" --resource-group "${RESOURCE_GROUP}" --query "properties.configuration.ingress.fqdn" -o tsv
