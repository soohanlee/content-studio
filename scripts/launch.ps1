# 콘텐츠 스튜디오를 켜고 엣지(또는 크롬) 앱 창으로 연다. 이미 켜져 있으면 창만 연다.
$ErrorActionPreference = 'SilentlyContinue'
$Root = Split-Path -Parent $PSScriptRoot
function Read-JsonFile($p) { if (Test-Path $p) { return (Get-Content $p -Raw -Encoding UTF8) | ConvertFrom-Json } else { return $null } }
$cfg = Read-JsonFile (Join-Path $Root 'config.json')
$port = 4600; if ($cfg -and $cfg.port) { $port = [int]$cfg.port }
$localCfg = Read-JsonFile (Join-Path $Root 'config.local.json')

$nodeBin = 'node'; $browser = ''
if ($localCfg) { if ($localCfg.nodeBin) { $nodeBin = $localCfg.nodeBin }; if ($localCfg.browserBin) { $browser = $localCfg.browserBin } }
$url = "http://localhost:$port"

function Test-Server {
  try { return ((Invoke-WebRequest -UseBasicParsing -Uri "http://127.0.0.1:$port/api/state" -TimeoutSec 2).StatusCode -eq 200) } catch { return $false }
}

if (-not (Test-Server)) {
  if (-not (Get-Command $nodeBin -ErrorAction SilentlyContinue) -and -not (Test-Path $nodeBin)) {
    Add-Type -AssemblyName PresentationFramework
    [System.Windows.MessageBox]::Show('Node.js를 찾지 못했습니다. install.bat 을 먼저 실행해 주세요.', '콘텐츠 스튜디오') | Out-Null
    exit 1
  }
  $logs = Join-Path $Root 'data\logs'
  New-Item -ItemType Directory -Force -Path $logs | Out-Null
  Start-Process -FilePath $nodeBin -ArgumentList 'server.js' -WorkingDirectory $Root -WindowStyle Hidden `
    -RedirectStandardOutput (Join-Path $logs 'server.log') -RedirectStandardError (Join-Path $logs 'server-error.log')
  for ($i = 0; $i -lt 40; $i++) { if (Test-Server) { break }; Start-Sleep -Milliseconds 300 }
}

if ($browser -and (Test-Path $browser)) { Start-Process -FilePath $browser -ArgumentList "--app=$url" } else { Start-Process $url }
