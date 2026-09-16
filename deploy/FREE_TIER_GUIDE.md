# 🆓 Zero-Cost Cloud Deployment Guide for EchoDoc

This guide shows you how to host and demo **EchoDoc Clinical Voice Agent** using **100% free platforms** without credit cards or cloud bills.

---

## 🌟 1. Hugging Face Spaces (Recommended for AI Hackathons)
Hugging Face provides **2 vCPUs and 16 GB of RAM completely free** with no idle timeout or sleep.

1. Go to [huggingface.co/spaces](https://huggingface.co/spaces) and click **"Create new Space"**.
2. Set Space Name: `echodoc-voice-agent`.
3. Select **Space SDK**: `Docker` > **Blank**.
4. Clone your new Space repo:
   ```bash
   git clone https://huggingface.co/spaces/YOUR_USERNAME/echodoc-voice-agent hf-space
   ```
5. Copy files into it:
   - Copy `Dockerfile`, `package.json`, `package-lock.json`, and `src/`.
   - Copy `README_HF.md` as `README.md` (contains the required metadata block).
6. Commit and push:
   ```bash
   git add . && git commit -m "feat: deploy EchoDoc Voice Agent" && git push
   ```
7. Hugging Face will automatically build and launch your live container at:
   `https://YOUR_USERNAME-echodoc-voice-agent.hf.space`

---

## ⚡ 2. Instant Live Demo: Cloudflare Tunnel (Zero Cloud Setup)
Run EchoDoc locally on your laptop and give judges an instant, global, high-speed HTTPS + WebSocket URL:

### Windows PowerShell:
```powershell
.\deploy\free\tunnel.ps1 -Port 3000
```

### Linux / macOS:
```bash
./deploy/free/tunnel.sh 3000
```
- Outputs a secure link like: `https://echo-clinical-agent.trycloudflare.com`
- Full microphone streaming, sub-second WebSockets, zero lag.

---

## 🚀 3. Render.com (1-Click Blueprint)
Render gives you a free Web Service with native Docker support.

1. Push your code to GitHub.
2. Go to [dashboard.render.com](https://dashboard.render.com) > **Blueprints** > **New Blueprint Instance**.
3. Connect your repository — Render will automatically read `render.yaml` and deploy!

---

## 🪂 4. Fly.io (Global Anycast Edge)
```bash
fly launch --config fly.toml
fly deploy
```

---

## 📊 Free Service Comparison Matrix
| Platform | Hardware Specs | Idle Sleep | WebSocket Support | Live URL |
| :--- | :--- | :---: | :---: | :--- |
| **Hugging Face Spaces** | **2 vCPU, 16GB RAM** | ❌ Never | ✅ Full | `*.hf.space` |
| **Cloudflare Tunnel** | Local host resources | ❌ Active | ✅ Full | `*.trycloudflare.com` |
| **Render** | 0.5 vCPU, 512MB RAM | ⚠️ 15 min | ✅ Full | `*.onrender.com` |
| **Fly.io** | 1 vCPU, 256MB RAM | ⚠️ Auto | ✅ Full | `*.fly.dev` |
