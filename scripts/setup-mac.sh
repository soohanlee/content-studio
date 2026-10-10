#!/bin/zsh
# 콘텐츠 스튜디오 Mac 설치 확인. 필요한 프로그램과 로그인 상태를 점검하고 이 컴퓨터의 경로를 config.local.json에 기록한다.
cd "$(dirname "$0")/.." || exit 1
ROOT="$(pwd)"
ok() { print -P "%F{green}✓%f $1"; }
bad() { print -P "%F{red}✗%f $1"; FAIL=1; }
warn() { print -P "%F{yellow}!%f $1"; }
FAIL=0

# nvm을 쓰는 경우 node를 찾을 수 있게 불러온다
[ -s "$HOME/.nvm/nvm.sh" ] && source "$HOME/.nvm/nvm.sh" >/dev/null 2>&1

NODE_BIN="$(command -v node)"
if [ -n "$NODE_BIN" ]; then ok "Node.js $("$NODE_BIN" --version) ($NODE_BIN)"; else bad "Node.js가 없습니다. https://nodejs.org 에서 LTS를 설치하세요."; fi

CLAUDE_BIN="$(command -v claude)"
[ -z "$CLAUDE_BIN" ] && [ -x "$HOME/.local/bin/claude" ] && CLAUDE_BIN="$HOME/.local/bin/claude"
if [ -n "$CLAUDE_BIN" ]; then ok "Claude Code $("$CLAUDE_BIN" --version 2>/dev/null) ($CLAUDE_BIN)"; else bad "Claude Code가 없습니다. 터미널에서: curl -fsSL https://claude.ai/install.sh | bash"; fi

if [ -n "$CLAUDE_BIN" ]; then
  AUTH="$("$CLAUDE_BIN" auth status 2>/dev/null)"
  METHOD="$(print -r -- "$AUTH" | grep -o '"authMethod": *"[^"]*"' | sed 's/.*: *"//; s/"$//')"
  PLAN="$(print -r -- "$AUTH" | grep -o '"subscriptionType": *"[^"]*"' | sed 's/.*: *"//; s/"$//')"
  if print -r -- "$AUTH" | grep -q '"loggedIn": *true'; then
    if [ "$METHOD" = "claude.ai" ]; then ok "Claude 구독 로그인 확인 (요금제: ${PLAN:-확인 불가})"
    else warn "Claude가 구독(claude.ai)이 아닌 방식($METHOD)으로 로그인되어 있습니다. API로 과금될 수 있으니 claude 에서 /login 으로 구독 계정에 다시 로그인하세요."; fi
  else bad "Claude에 로그인되어 있지 않습니다. 터미널에서 claude 를 실행해 구독 계정으로 로그인하세요."; fi
fi

BROWSER="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
if [ -x "$BROWSER" ]; then ok "Google Chrome (카드 이미지용)"; else warn "Google Chrome이 없어 카드 PNG 대신 HTML만 만듭니다."; BROWSER=""; fi

if [ -n "$ANTHROPIC_API_KEY" ] || grep -qs "ANTHROPIC_API_KEY" ~/.zshrc ~/.zprofile ~/.bash_profile 2>/dev/null; then
  warn "ANTHROPIC_API_KEY가 설정되어 있습니다. 콘텐츠 스튜디오는 실행할 때 이 값을 지워 구독으로 돌리지만, 터미널에서 claude를 직접 쓸 때는 API로 과금될 수 있습니다."
else
  ok "ANTHROPIC_API_KEY 없음 (구독으로 실행)"
fi

if [ "$FAIL" = "0" ]; then
  cat > config.local.json <<EOF
{
  "claudeBin": "$CLAUDE_BIN",
  "browserBin": "$BROWSER",
  "nodeBin": "$NODE_BIN"
}
EOF
  print "NODE_BIN=\"$NODE_BIN\"" > scripts/env.sh
  chmod +x start.command scripts/*.sh
  ok "config.local.json 기록 완료"
  echo ""
  echo "다음: start.command 를 더블클릭하면 콘텐츠 스튜디오가 열립니다."
  echo "주간 자동 실행 등록: ./scripts/schedule-weekly.sh install"
else
  echo ""; echo "위의 ✗ 항목을 해결한 뒤 다시 실행하세요."; exit 1
fi
