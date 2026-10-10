# 매주 월요일 오전 7시 주제 후보 생성을 작업 스케줄러에 등록/해제한다.
# 사용법: schedule-weekly.ps1 -Install  /  schedule-weekly.ps1 -Uninstall
param([switch]$Install, [switch]$Uninstall)
$Root = Split-Path -Parent $PSScriptRoot
function Read-JsonFile($p) { if (Test-Path $p) { return (Get-Content $p -Raw -Encoding UTF8) | ConvertFrom-Json } else { return $null } }
$cfg = Read-JsonFile (Join-Path $Root 'config.json')
$port = 4600; if ($cfg -and $cfg.port) { $port = [int]$cfg.port }
$localCfg = Read-JsonFile (Join-Path $Root 'config.local.json')

$name = 'Content Studio Weekly'
if ($Uninstall) {
  Unregister-ScheduledTask -TaskName $name -Confirm:$false -ErrorAction SilentlyContinue
  Write-Host '주간 자동 실행을 해제했습니다.'
  return
}
$nodeBin = 'node'; if ($localCfg -and $localCfg.nodeBin) { $nodeBin = $localCfg.nodeBin }
$weekly = Join-Path $Root 'scripts\weekly.js'
$ps = Join-Path $env:WINDIR 'System32\WindowsPowerShell\v1.0\powershell.exe'
$cmd = "& '" + $nodeBin + "' '" + $weekly + "'"
$action = New-ScheduledTaskAction -Execute $ps -Argument ('-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -Command "' + $cmd + '"') -WorkingDirectory $Root
$trigger = New-ScheduledTaskTrigger -Weekly -DaysOfWeek Monday -At 7am
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit (New-TimeSpan -Hours 1)
Register-ScheduledTask -TaskName $name -Action $action -Trigger $trigger -Settings $settings -Description '콘텐츠 스튜디오: 매주 월요일 주제 후보 만들기' -Force | Out-Null
Write-Host '등록했습니다: 매주 월요일 오전 7시 (노트북이 꺼져 있었으면 켜진 뒤 실행)'
