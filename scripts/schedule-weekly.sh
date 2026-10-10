#!/bin/zsh
# 매주 월요일 07:00(이 Mac의 시간대 기준) 주제 후보 생성을 launchd에 등록/해제한다.
# Mac이 잠자고 있었으면 깨어날 때 실행된다(전원이 꺼져 있던 경우는 실행되지 않으며, 그때는 앱을 열면 자동 생성된다).
cd "$(dirname "$0")/.." || exit 1
ROOT="$(pwd)"
LABEL="com.contentstudio.weekly"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
[ -f scripts/env.sh ] && source scripts/env.sh
NODE_BIN="${NODE_BIN:-$(command -v node)}"
CLAUDE_DIR="$(dirname "$(grep -o '"claudeBin": *"[^"]*"' config.local.json 2>/dev/null | sed 's/.*: *"//; s/"$//')")"

case "$1" in
  install)
    [ -z "$NODE_BIN" ] && { echo "node를 찾지 못했습니다. 먼저 ./scripts/setup-mac.sh 를 실행하세요."; exit 1; }
    mkdir -p "$HOME/Library/LaunchAgents" data/logs
    cat > "$PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$LABEL</string>
  <key>ProgramArguments</key>
  <array><string>$NODE_BIN</string><string>$ROOT/scripts/weekly.js</string></array>
  <key>WorkingDirectory</key><string>$ROOT</string>
  <key>EnvironmentVariables</key>
  <dict><key>PATH</key><string>$CLAUDE_DIR:$(dirname "$NODE_BIN"):/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin</string></dict>
  <key>StartCalendarInterval</key>
  <dict><key>Weekday</key><integer>1</integer><key>Hour</key><integer>7</integer><key>Minute</key><integer>0</integer></dict>
  <key>StandardOutPath</key><string>$ROOT/data/logs/weekly.log</string>
  <key>StandardErrorPath</key><string>$ROOT/data/logs/weekly.log</string>
</dict>
</plist>
EOF
    launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null
    launchctl bootstrap "gui/$(id -u)" "$PLIST" && echo "등록했습니다: 매주 월요일 07:00 ($PLIST)"
    ;;
  uninstall)
    launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null
    rm -f "$PLIST" && echo "해제했습니다."
    ;;
  run)
    launchctl kickstart -k "gui/$(id -u)/$LABEL" && echo "지금 한 번 실행했습니다. 로그: data/logs/weekly.log"
    ;;
  status)
    launchctl print "gui/$(id -u)/$LABEL" 2>/dev/null | grep -E "state|last exit" || echo "등록되어 있지 않습니다."
    ;;
  *)
    echo "사용법: ./scripts/schedule-weekly.sh install | uninstall | run | status"
    ;;
esac
