# 콘텐츠 스튜디오 서버를 끈다.
$Root = Split-Path -Parent $PSScriptRoot
function Read-JsonFile($p) { if (Test-Path $p) { return (Get-Content $p -Raw -Encoding UTF8) | ConvertFrom-Json } else { return $null } }
$cfg = Read-JsonFile (Join-Path $Root 'config.json')
$port = 4600; if ($cfg -and $cfg.port) { $port = [int]$cfg.port }
$localCfg = Read-JsonFile (Join-Path $Root 'config.local.json')

$conns = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
if ($conns) {
  foreach ($c in $conns) { Stop-Process -Id $c.OwningProcess -Force -ErrorAction SilentlyContinue }
  Write-Host '콘텐츠 스튜디오를 껐습니다.'
} else {
  Write-Host '콘텐츠 스튜디오가 켜져 있지 않습니다.'
}
Start-Sleep -Seconds 2
