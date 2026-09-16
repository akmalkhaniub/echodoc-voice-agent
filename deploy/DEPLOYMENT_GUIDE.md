# ☁️ EchoDoc Voice Agent — Multi-Cloud Deployment Guide

This guide provides end-to-end instructions for deploying **EchoDoc Clinical Voice Agent** across **AWS, GCP, Azure, and Kubernetes**, as well as local containerized experimentation.

---

## 📋 Table of Contents
1. [Prerequisites & Environment Variables](#prerequisites--environment-variables)
2. [Local Docker & Docker Compose](#1-local-docker--docker-compose)
3. [Amazon Web Services (AWS App Runner & ECS)](#2-amazon-web-services-aws)
4. [Google Cloud Platform (Cloud Run)](#3-google-cloud-platform-gcp)
5. [Microsoft Azure (Azure Container Apps)](#4-microsoft-azure)
6. [Kubernetes (EKS / GKE / AKS / Hybrid)](#5-kubernetes-multi-cloud)
7. [Post-Deployment Health & Streaming Verification](#6-post-deployment-verification)

---

## Prerequisites & Environment Variables

| Variable | Required | Default | Description |
| :--- | :---: | :---: | :--- |
| `PORT` | Optional | `3000` (GCP sets `8080`) | Port on which the HTTP/WebSocket server listens. |
| `NODE_ENV` | Optional | `production` | Environment mode (`development` or `production`). |
| `ASSEMBLYAI_API_KEY` | Recommended | `your_assemblyai_api_key_here` | AssemblyAI API Key. If absent, app operates in self-contained **Mock Mode**. |
| `MOCK_STREAMING` | Optional | `false` | Force synthetic medical transcript stream for offline demo evaluation. |

---

## 1. Local Docker & Docker Compose

### Fast Build & Run
```bash
# Build the production Docker image (<120MB)
docker build -t echodoc-voice-agent:latest .

# Run container with dynamic port mapping
docker run -d -p 3000:3000 --name echodoc echodoc-voice-agent:latest

# Check live health status
curl http://localhost:3000/api/health
```

### Docker Compose
```bash
docker compose up -d
docker compose logs -f
```
Open **`http://localhost:3000`** in your browser.

---

## 2. Amazon Web Services (AWS)

### Option A: AWS App Runner (Recommended for 1-Click Serverless)
AWS App Runner offers zero-infrastructure serverless container hosting with automatic TLS, scaling, and native WebSocket support.

**Deploy via CLI (Bash or PowerShell):**
```bash
# Linux/macOS
./deploy/aws/deploy.sh

# Windows PowerShell
./deploy/aws/deploy.ps1 -Region us-east-1
```

**Launch App Runner Service:**
```bash
aws apprunner create-service \
  --service-name echodoc-voice-agent \
  --source-configuration ImageRepository="{ImageIdentifier=YOUR_ACCOUNT_ID.dkr.ecr.us-east-1.amazonaws.com/echodoc-voice-agent:latest,ImageRepositoryType=ECR,ImageConfiguration={Port=3000,RuntimeEnvironmentVariables={NODE_ENV=production}}}"
```

### Option B: AWS ECS Fargate
For enterprise VPC workloads with Application Load Balancers:
```bash
aws ecs register-task-definition --cli-input-json file://deploy/aws/task-definition.json
```

---

## 3. Google Cloud Platform (GCP)

### Google Cloud Run (Serverless WebSockets & Zero-Scale)
Google Cloud Run automatically provisions HTTPS endpoints, scales to zero when idle, and natively supports WebSockets over HTTP/1.1 and HTTP/2.

**Deploy via Script:**
```bash
# Linux/macOS
./deploy/gcp/deploy.sh

# Windows PowerShell
./deploy/gcp/deploy.ps1 -ProjectId YOUR_GCP_PROJECT -Region us-central1
```

**Manual One-Liner (Source Deploy via Cloud Build):**
```bash
gcloud run deploy echodoc-voice-agent \
  --source . \
  --region us-central1 \
  --platform managed \
  --allow-unauthenticated \
  --port 8080 \
  --timeout 3600 \
  --concurrency 80 \
  --cpu 1 \
  --memory 1Gi \
  --set-env-vars NODE_ENV=production,PORT=8080
```

---

## 4. Microsoft Azure

### Azure Container Apps (ACA)
Azure Container Apps runs containerized microservices on serverless Kubernetes (Envoy + KEDA), ideal for continuous WebSocket streaming.

**Deploy via Script:**
```bash
# Linux/macOS
./deploy/azure/deploy.sh

# Windows PowerShell
./deploy/azure/deploy.ps1 -ResourceGroup echodoc-rg -Location eastus
```

**Direct CLI Deployment:**
```bash
az containerapp up \
  --name echodoc-voice-agent \
  --resource-group echodoc-rg \
  --location eastus \
  --source . \
  --target-port 3000 \
  --ingress external \
  --env-vars NODE_ENV=production PORT=3000
```

---

## 5. Kubernetes (Multi-Cloud)

Deploy to any CNCF-certified Kubernetes cluster (AWS EKS, Google GKE, Azure AKS, or local Kind/Minikube):

### Quick Apply with Kustomize
```bash
# Apply entire stack (ConfigMap, Secret, Deployment, Service, Ingress)
kubectl apply -k deploy/k8s/

# Verify rollout status
kubectl rollout status deployment/echodoc-voice-agent

# Inspect active pods and health
kubectl get pods -l app=echodoc-voice-agent
```

### Key Kubernetes Ingress Annotations for Audio WebSockets
The included `deploy/k8s/ingress.yaml` includes essential configuration to prevent connection timeouts during clinical audio streaming:
```yaml
nginx.ingress.kubernetes.io/proxy-read-timeout: "3600"
nginx.ingress.kubernetes.io/proxy-send-timeout: "3600"
nginx.ingress.kubernetes.io/websocket-services: "echodoc-service"
```

---

## 6. Post-Deployment Verification

Once deployed to any cloud provider, run these validation steps against your public URL:

### 1. Health Probe
```bash
curl -i https://YOUR_DEPLOYED_URL/api/health
```
**Expected Response:**
```json
HTTP/2 200 
content-type: application/json

{
  "status": "online",
  "service": "EchoDoc Voice Agent",
  "timestamp": "2026-09-16T07:30:00.000Z",
  "hasApiKey": true,
  "mockMode": false
}
```

### 2. Ephemeral Token Generation
```bash
curl -i https://YOUR_DEPLOYED_URL/api/token
```

### 3. Open Clinical Voice Dashboard
Navigate to `https://YOUR_DEPLOYED_URL` in Chrome/Edge/Firefox, grant microphone permission, and click **"Start Real-Time Dictation"** to test live audio capture and sub-second transcription.
