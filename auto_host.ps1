# MeshyMMO - hospedagem automatica (servidor + tunel publico Cloudflare)
# Rode: powershell -ExecutionPolicy Bypass -File auto_host.ps1
$ErrorActionPreference = 'Continue'
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $Root

$Port = 3000
$CfExe = Join-Path $env:LOCALAPPDATA 'cloudflared\cloudflared.exe'
$UrlFile = Join-Path $Root 'PUBLIC_URL.txt'
$LogDir = Join-Path $Root 'logs'
New-Item -ItemType Directory -Force -Path $LogDir | Out-Null

function Write-Status($msg) {
  $line = "[{0}] {1}" -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $msg
  Write-Host $line
  Add-Content -Path (Join-Path $LogDir 'host.log') -Value $line -Encoding UTF8
}

function Ensure-Cloudflared {
  if (Test-Path $CfExe) { return $true }
  Write-Status "Baixando cloudflared..."
  $dir = Split-Path $CfExe
  New-Item -ItemType Directory -Force -Path $dir | Out-Null
  try {
    Invoke-WebRequest -Uri 'https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe' -OutFile $CfExe -UseBasicParsing
    return (Test-Path $CfExe)
  } catch {
    Write-Status "Falha ao baixar cloudflared: $_"
    return $false
  }
}

function Test-PortOpen([int]$p) {
  try {
    $c = New-Object System.Net.Sockets.TcpClient
    $c.Connect('127.0.0.1', $p)
    $c.Close()
    return $true
  } catch { return $false }
}

function Ensure-Deps {
  if (-not (Test-Path (Join-Path $Root 'node_modules\express'))) {
    Write-Status "npm install..."
    & npm install --prefix $Root
  }
}

function Start-GameServer {
  if (Test-PortOpen $Port) {
    Write-Status "Servidor ja escuta na porta $Port"
    return
  }
  # limpa listeners mortos na 3000
  Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue |
    ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }

  Write-Status "Iniciando Node server..."
  $out = Join-Path $LogDir 'server.out.log'
  $err = Join-Path $LogDir 'server.err.log'
  Start-Process -FilePath 'node' -ArgumentList 'server/index.js' -WorkingDirectory $Root `
    -WindowStyle Hidden -RedirectStandardOutput $out -RedirectStandardError $err

  for ($i = 0; $i -lt 30; $i++) {
    Start-Sleep -Milliseconds 500
    if (Test-PortOpen $Port) {
      try {
        $h = Invoke-WebRequest -Uri "http://127.0.0.1:$Port/api/health" -UseBasicParsing -TimeoutSec 3
        Write-Status "Servidor OK ($($h.StatusCode))"
        return
      } catch {}
    }
  }
  Write-Status "AVISO: servidor pode nao ter subido a tempo"
}

function Get-TunnelUrlFromLogs {
  $files = @(
    (Join-Path $LogDir 'tunnel.out.log'),
    (Join-Path $LogDir 'tunnel.err.log')
  )
  foreach ($f in $files) {
    if (-not (Test-Path $f)) { continue }
    $txt = Get-Content $f -Raw -ErrorAction SilentlyContinue
    if ($txt -match 'https://[a-z0-9-]+\.trycloudflare\.com') {
      return $Matches[0]
    }
  }
  return $null
}

function Start-Tunnel {
  if (-not (Ensure-Cloudflared)) { return $null }

  $alive = Get-Process cloudflared -ErrorAction SilentlyContinue
  $existing = Get-TunnelUrlFromLogs
  if ($alive -and $existing) {
    Set-Content -Path $UrlFile -Value $existing -Encoding UTF8
    return $existing
  }

  Get-Process cloudflared -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
  Start-Sleep -Seconds 1

  $out = Join-Path $LogDir 'tunnel.out.log'
  $err = Join-Path $LogDir 'tunnel.err.log'
  Remove-Item $out, $err -ErrorAction SilentlyContinue

  Write-Status "Abrindo tunel publico Cloudflare..."
  Start-Process -FilePath $CfExe `
    -ArgumentList @('tunnel', '--url', "http://127.0.0.1:$Port", '--no-autoupdate') `
    -WorkingDirectory $Root -WindowStyle Hidden `
    -RedirectStandardOutput $out -RedirectStandardError $err

  $url = $null
  for ($i = 0; $i -lt 45; $i++) {
    Start-Sleep -Seconds 1
    $url = Get-TunnelUrlFromLogs
    if ($url) { break }
  }

  if ($url) {
    Set-Content -Path $UrlFile -Value $url -Encoding UTF8
    Write-Status "URL publica: $url"
  } else {
    Write-Status "Nao foi possivel obter URL do tunel (veja logs/tunnel.*)"
  }
  return $url
}

function Ensure-Everything {
  Ensure-Deps
  if (-not (Test-PortOpen $Port)) { Start-GameServer }
  $cf = Get-Process cloudflared -ErrorAction SilentlyContinue
  if (-not $cf) {
    Start-Tunnel | Out-Null
  } else {
    $u = Get-TunnelUrlFromLogs
    if ($u) { Set-Content -Path $UrlFile -Value $u -Encoding UTF8 }
  }
}

# ---- main ----
Write-Status "=== MeshyMMO Auto Host ==="
Ensure-Deps
Start-GameServer
$url = Start-Tunnel

if ($url) {
  Write-Host ""
  Write-Host "================================================" -ForegroundColor Green
  Write-Host "  JOGO ONLINE (publico):" -ForegroundColor Green
  Write-Host "  $url" -ForegroundColor Cyan
  Write-Host "  $url/?dev=1" -ForegroundColor Cyan
  Write-Host "  DEV: dev / dev123  |  Hero: DevHero" -ForegroundColor Yellow
  Write-Host "================================================" -ForegroundColor Green
  Write-Host ""
  try { Start-Process "$url/?dev=1" } catch {}
}

Write-Status "Monitor ativo: reabre servidor/tunel se cairem. Ctrl+C para parar."
while ($true) {
  try {
    if (-not (Test-PortOpen $Port)) {
      Write-Status "Servidor caiu — reiniciando..."
      Start-GameServer
    }
    if (-not (Get-Process cloudflared -ErrorAction SilentlyContinue)) {
      Write-Status "Tunel caiu — reiniciando..."
      Start-Tunnel | Out-Null
    }
  } catch {
    Write-Status "Erro no monitor: $_"
  }
  Start-Sleep -Seconds 5
}
