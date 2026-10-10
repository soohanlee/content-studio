#!/bin/zsh
# 콘텐츠 스튜디오를 켜고 앱 창으로 연다. start.command와 콘텐츠 스튜디오.app이 이 스크립트를 부른다.
cd "$(dirname "$0")/.." || exit 1
[ -f scripts/env.sh ] && source scripts/env.sh
[ -z "$NODE_BIN" ] && [ -s "$HOME/.nvm/nvm.sh" ] && source "$HOME/.nvm/nvm.sh" >/dev/null 2>&1
NODE_BIN="${NODE_BIN:-$(command -v node)}"
PORT=$(grep -o '"port": *[0-9]*' config.json | grep -o '[0-9]*$'); PORT=${PORT:-4600}
URL="http://localhost:$PORT"
mkdir -p data/logs

if ! curl -s -o /dev/null "http://127.0.0.1:$PORT/api/state"; then
  if [ -z "$NODE_BIN" ]; then
    osascript -e 'display alert "콘텐츠 스튜디오" message "Node.js를 찾지 못했습니다. scripts/setup-mac.sh 를 먼저 실행하세요."' >/dev/null 2>&1
    exit 1
  fi
  nohup "$NODE_BIN" server.js >> data/logs/server.log 2>&1 &
  for i in {1..30}; do curl -s -o /dev/null "http://127.0.0.1:$PORT/api/state" && break; sleep 0.3; done
fi

# 주소창 없는 앱 창으로 연다(크롬 → 엣지 → 기본 브라우저 순)
if [ -d "/Applications/Google Chrome.app" ]; then
  open -na "Google Chrome" --args --app="$URL"
elif [ -d "/Applications/Microsoft Edge.app" ]; then
  open -na "Microsoft Edge" --args --app="$URL"
else
  open "$URL"
fi
