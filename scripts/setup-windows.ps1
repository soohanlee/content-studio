# 콘텐츠 스튜디오 Windows 설치 확인
# 필요한 프로그램과 Claude 구독 로그인을 점검하고, 이 컴퓨터의 경로를 config.local.json에 기록하고, 바탕화면 바로가기를 만든다.
$Root = Split-Path -Parent $PSScriptRoot
function Read-JsonFile($p) { if (Test-Path $p) { return (Get-Content $p -Raw -Encoding UTF8) | ConvertFrom-Json } else { return $null } }
$cfg = Read-JsonFile (Join-Path $Root 'config.json')
$port = 4600; if ($cfg -and $cfg.port) { $port = [int]$cfg.port }
$localCfg = Read-JsonFile (Join-Path $Root 'config.local.json')

$fail = $false
function Ok($m) { Write-Host "[확인] $m" -ForegroundColor Green }
function Bad($m) { Write-Host "[필요] $m" -ForegroundColor Red; $script:fail = $true }
function Warn($m) { Write-Host "[주의] $m" -ForegroundColor Yellow }

Write-Host ''
Write-Host '=== 콘텐츠 스튜디오 설치 확인 ===' -ForegroundColor Cyan

# 1) Node.js
$node = Get-Command node -ErrorAction SilentlyContinue
if ($node) { Ok ("Node.js " + (& node --version) + " (" + $node.Source + ")") }
else { Bad 'Node.js가 없습니다. https://nodejs.org 에서 LTS 버전을 설치한 뒤 다시 실행하세요. (또는 PowerShell에서: winget install OpenJS.NodeJS.LTS)' }

# 2) Claude Code
$claude = $null
$cmdClaude = Get-Command claude -ErrorAction SilentlyContinue
if ($cmdClaude) { $claude = $cmdClaude.Source }
elseif (Test-Path (Join-Path $env:USERPROFILE '.local\bin\claude.exe')) { $claude = Join-Path $env:USERPROFILE '.local\bin\claude.exe' }
if ($claude) { Ok ("Claude Code " + (& $claude --version) + " (" + $claude + ")") }
else { Bad 'Claude Code가 없습니다. PowerShell에서 다음을 실행하세요:  irm https://claude.ai/install.ps1 | iex' }

# 3) Claude 구독 로그인
if ($claude) {
  try {
    $auth = (& $claude auth status 2>$null | Out-String) | ConvertFrom-Json
    if ($auth.loggedIn -and $auth.authMethod -eq 'claude.ai') { Ok ("Claude 구독 로그인 확인 (요금제: " + $auth.subscriptionType + ")") }
    elseif ($auth.loggedIn) { Warn ("Claude가 구독이 아닌 방식(" + $auth.authMethod + ")으로 로그인되어 있습니다. API로 과금될 수 있으니 claude 를 실행해 /login 으로 구독 계정에 다시 로그인하세요.") }
    else { Bad 'Claude에 로그인되어 있지 않습니다. 새 PowerShell 창에서 claude 를 실행해 구독(Pro/Max) 계정으로 로그인하세요.' }
  } catch { Warn '로그인 상태를 확인하지 못했습니다. 새 PowerShell 창에서 claude 를 실행해 구독 계정으로 로그인되어 있는지 확인하세요.' }
}

# 4) 카드 이미지용 브라우저 (엣지 우선)
$browser = ''
$candidates = @(
  (Join-Path ${env:ProgramFiles(x86)} 'Microsoft\Edge\Application\msedge.exe'),
  (Join-Path $env:ProgramFiles 'Microsoft\Edge\Application\msedge.exe'),
  (Join-Path $env:ProgramFiles 'Google\Chrome\Application\chrome.exe'),
  (Join-Path $env:LOCALAPPDATA 'Google\Chrome\Application\chrome.exe')
)
foreach ($c in $candidates) { if ($c -and (Test-Path $c)) { $browser = $c; break } }
if ($browser) { Ok "카드 이미지용 브라우저 ($browser)" } else { Warn '엣지/크롬을 찾지 못해 카드 이미지를 PNG로 만들 수 없습니다.' }

# 5) API 키가 있으면 경고 (있으면 구독 대신 API로 과금될 수 있음)
$apiKey = $env:ANTHROPIC_API_KEY
if (-not $apiKey) { $apiKey = [Environment]::GetEnvironmentVariable('ANTHROPIC_API_KEY', 'User') }
if ($apiKey) { Warn 'ANTHROPIC_API_KEY가 설정되어 있습니다. 콘텐츠 스튜디오는 실행할 때 지우고 구독으로 돌리지만, claude 를 직접 쓸 때는 API로 과금될 수 있습니다.' }
else { Ok 'ANTHROPIC_API_KEY 없음 (구독으로 실행)' }

if ($fail) {
  Write-Host ''
  Write-Host '위의 [필요] 항목을 해결한 뒤 install.bat 을 다시 실행하세요.' -ForegroundColor Red
  return
}

# 6) 이 컴퓨터의 경로 기록 (BOM 없는 UTF-8)
$local = [ordered]@{ claudeBin = $claude; browserBin = $browser; nodeBin = $node.Source }
$json = $local | ConvertTo-Json
[System.IO.File]::WriteAllText((Join-Path $Root 'config.local.json'), $json, (New-Object System.Text.UTF8Encoding $false))
Ok 'config.local.json 기록 완료'

# 7) 바탕화면 바로가기
$desktop = [Environment]::GetFolderPath('Desktop')
$ws = New-Object -ComObject WScript.Shell
$lnk = $ws.CreateShortcut((Join-Path $desktop '콘텐츠 스튜디오.lnk'))
$lnk.TargetPath = Join-Path $env:WINDIR 'System32\WindowsPowerShell\v1.0\powershell.exe'
$lnk.Arguments = '-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File "' + (Join-Path $Root 'scripts\launch.ps1') + '"'
$lnk.WorkingDirectory = $Root
$lnk.IconLocation = (Join-Path $Root 'public\icons\studio.ico')
$lnk.WindowStyle = 7
$lnk.Save()
Ok '바탕화면에 "콘텐츠 스튜디오" 바로가기를 만들었습니다.'

# 8) 주간 자동 실행
Write-Host ''
$ans = Read-Host '매주 월요일 오전 7시에 주제 후보를 자동으로 만들까요? (Y/N)'
if ($ans -match '^[Yy]') { & (Join-Path $PSScriptRoot 'schedule-weekly.ps1') -Install }

Write-Host ''
Write-Host '설치가 끝났습니다. 바탕화면의 "콘텐츠 스튜디오"를 더블클릭하세요.' -ForegroundColor Cyan
