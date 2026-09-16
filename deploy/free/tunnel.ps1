# ==============================================================================
# Cloudflare Tunnel 1-Click Zero-Cost Launcher (Windows PowerShell)
# Gives your local EchoDoc Voice Agent an instant public HTTPS + WebSocket URL!
# Zero configuration, zero account required, 100% free with unlimited bandwidth.
# ==============================================================================
param (
    [int]$Port = 3000
)

$ErrorActionPreference = "Stop"

Write-Host "🌐 [Cloudflare Tunnel] Preparing instant public URL for localhost:$Port..." -ForegroundColor Cyan

# Check if cloudflared is already installed
$cloudflaredCmd = Get-Command cloudflared -ErrorAction SilentlyContinue

if (-not $cloudflaredCmd) {
    $tempDir = Join-Path $env:TEMP "cloudflared"
    if (-not (Test-Path $tempDir)) { New-Item -ItemType Directory -Path $tempDir | Out-Null }
    $exePath = Join-Path $tempDir "cloudflared.exe"

    if (-not (Test-Path $exePath)) {
        Write-Host "⬇️ Downloading standalone cloudflared binary (portable, no install needed)..." -ForegroundColor Yellow
        $url = "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe"
        Invoke-WebRequest -Uri $url -OutFile $exePath
    }
    $cloudflaredCmd = $exePath
} else {
    $cloudflaredCmd = "cloudflared"
}

Write-Host "🚀 Launching Cloudflare Tunnel for http://localhost:$Port..." -ForegroundColor Green
Write-Host "⚡ Note: Look for the 'https://*.trycloudflare.com' URL in the output below." -ForegroundColor Yellow
Write-Host "   Share that link with hackathon judges for a 100% live, interactive demo!" -ForegroundColor Cyan

& $cloudflaredCmd tunnel --url "http://localhost:$Port"
