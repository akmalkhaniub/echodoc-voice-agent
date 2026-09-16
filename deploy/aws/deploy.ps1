# ==============================================================================
# AWS PowerShell Deployment Script for EchoDoc Clinical Voice Agent
# Target: AWS App Runner or AWS ECS Fargate via Amazon ECR
# ==============================================================================
param (
    [string]$Region = "us-east-1",
    [string]$RepoName = "echodoc-voice-agent",
    [string]$Tag = "latest"
)

$ErrorActionPreference = "Stop"

Write-Host "🚀 [AWS Deploy] Initiating EchoDoc deployment to AWS ($Region)..." -ForegroundColor Cyan

# 1. Fetch AWS Account ID
$AccountId = (aws sts get-caller-identity --query Account --output text).Trim()
if (-not $AccountId) {
    Write-Error "Failed to retrieve AWS Account ID. Please ensure AWS CLI is authenticated ('aws configure')."
}

$EcrUri = "$AccountId.dkr.ecr.$Region.amazonaws.com/$RepoName`:$Tag"

# 2. Login to ECR
Write-Host "🔑 Authenticating Docker with Amazon ECR..." -ForegroundColor Yellow
aws ecr get-login-password --region $Region | docker login --username AWS --password-stdin "$AccountId.dkr.ecr.$Region.amazonaws.com"

# 3. Create ECR Repo if not exists
Write-Host "📦 Ensuring ECR Repository '$RepoName' exists..." -ForegroundColor Yellow
$repoCheck = aws ecr describe-repositories --repository-names $RepoName --region $Region 2>$null
if (-not $repoCheck) {
    aws ecr create-repository --repository-name $RepoName --region $Region | Out-Null
    Write-Host "Created ECR repository: $RepoName" -ForegroundColor Green
}

# 4. Build Docker image
Write-Host "🔨 Building Docker image: $EcrUri..." -ForegroundColor Yellow
docker build -t $EcrUri -f Dockerfile .

# 5. Push to ECR
Write-Host "⬆️ Pushing image to Amazon ECR..." -ForegroundColor Yellow
docker push $EcrUri

Write-Host "✅ Container successfully published to Amazon ECR: $EcrUri" -ForegroundColor Green
Write-Host "👉 Next step: Launch via AWS App Runner or ECS Fargate!" -ForegroundColor Cyan
