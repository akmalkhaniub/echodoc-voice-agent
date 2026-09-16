# ==============================================================================
# Azure Container Apps PowerShell Deployment Script for EchoDoc Clinical Voice Agent
# Target: Azure Container Apps (ACA)
# ==============================================================================
param (
    [string]$ResourceGroup = "echodoc-rg",
    [string]$Location = "eastus",
    [string]$EnvironmentName = "echodoc-env",
    [string]$AppName = "echodoc-voice-agent"
)

$ErrorActionPreference = "Stop"

Write-Host "🚀 [Azure Deploy] Checking Azure Resource Group '$ResourceGroup'..." -ForegroundColor Cyan
az group create --name $ResourceGroup --location $Location -o table

Write-Host "📦 Ensuring Azure Container Apps Environment '$EnvironmentName'..." -ForegroundColor Yellow
az containerapp env create --name $EnvironmentName --resource-group $ResourceGroup --location $Location -o table

Write-Host "🔨 Building container & deploying via 'az containerapp up'..." -ForegroundColor Yellow
az containerapp up `
  --name $AppName `
  --resource-group $ResourceGroup `
  --environment $EnvironmentName `
  --source . `
  --target-port 3000 `
  --ingress external `
  --env-vars NODE_ENV=production PORT=3000

$Fqdn = (az containerapp show --name $AppName --resource-group $ResourceGroup --query "properties.configuration.ingress.fqdn" -o tsv).Trim()
Write-Host "✅ EchoDoc Voice Agent is live on Microsoft Azure!" -ForegroundColor Green
Write-Host "🌐 Public URL: https://$Fqdn" -ForegroundColor Cyan
