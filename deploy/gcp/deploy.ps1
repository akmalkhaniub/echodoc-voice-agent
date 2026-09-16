# ==============================================================================
# Google Cloud Run PowerShell Deployment Script for EchoDoc Clinical Voice Agent
# Target: Fully managed Serverless Google Cloud Run
# ==============================================================================
param (
    [string]$ProjectId = "",
    [string]$Region = "us-central1",
    [string]$ServiceName = "echodoc-voice-agent"
)

$ErrorActionPreference = "Stop"

if (-not $ProjectId) {
    $ProjectId = (gcloud config get-value project 2>$null).Trim()
}

if (-not $ProjectId) {
    Write-Error "GCP Project ID not set. Please pass -ProjectId <id> or run 'gcloud config set project <id>'."
}

$ImageUri = "$Region-docker.pkg.dev/$ProjectId/cloud-run-source-deploy/$ServiceName`:latest"

Write-Host "🚀 [GCP Deploy] Submitting build to Google Cloud Build..." -ForegroundColor Cyan
gcloud builds submit --tag $ImageUri .

Write-Host "☁️ Deploying to Google Cloud Run ($Region)..." -ForegroundColor Yellow
gcloud run deploy $ServiceName `
  --image $ImageUri `
  --region $Region `
  --platform managed `
  --allow-unauthenticated `
  --port 8080 `
  --timeout 3600 `
  --concurrency 80 `
  --cpu 1 `
  --memory 1Gi `
  --set-env-vars NODE_ENV=production,PORT=8080

$ServiceUrl = (gcloud run services describe $ServiceName --platform managed --region $Region --format 'value(status.url)').Trim()
Write-Host "✅ EchoDoc Voice Agent is live on Google Cloud Run!" -ForegroundColor Green
Write-Host "🌐 Public URL: $ServiceUrl" -ForegroundColor Cyan
