#!/usr/bin/env bash
# ==============================================================================
# AWS Deployment Script for EchoDoc Clinical Voice Agent
# Target: AWS App Runner or AWS ECS Fargate via Amazon ECR
# ==============================================================================
set -euo pipefail

AWS_REGION="${AWS_REGION:-us-east-1}"
AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
ECR_REPO_NAME="echodoc-voice-agent"
IMAGE_TAG="latest"
ECR_URI="${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com/${ECR_REPO_NAME}:${IMAGE_TAG}"

echo "🚀 [AWS Deploy] Deploying EchoDoc Voice Agent to AWS (${AWS_REGION})..."

# 1. Authenticate Docker with Amazon ECR
echo "🔑 Logging into Amazon ECR..."
aws ecr get-login-password --region "${AWS_REGION}" | docker login --username AWS --password-stdin "${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com"

# 2. Ensure repository exists
echo "📦 Checking ECR repository..."
aws ecr describe-repositories --repository-names "${ECR_REPO_NAME}" --region "${AWS_REGION}" || \
  aws ecr create-repository --repository-name "${ECR_REPO_NAME}" --region "${AWS_REGION}"

# 3. Build container image
echo "🔨 Building Docker image: ${ECR_URI}..."
docker build -t "${ECR_URI}" -f Dockerfile .

# 4. Push to ECR
echo "⬆️ Pushing image to ECR..."
docker push "${ECR_URI}"

echo "✅ Container successfully pushed to Amazon ECR: ${ECR_URI}"
echo "👉 To create/update AWS App Runner service:"
echo "   aws apprunner create-service --service-name echodoc-voice-agent --source-configuration ImageRepository={ImageIdentifier=${ECR_URI},ImageRepositoryType=ECR,ImageConfiguration={Port=3000}}"
