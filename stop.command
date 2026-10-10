#!/bin/zsh
# 콘텐츠 스튜디오 서버를 끈다.
cd "$(dirname "$0")" || exit 1
PORT=$(grep -o '"port": *[0-9]*' config.json | grep -o '[0-9]*$')
PID=$(lsof -ti "tcp:${PORT:-4600}" -sTCP:LISTEN)
if [ -n "$PID" ]; then kill $PID && echo "콘텐츠 스튜디오를 껐습니다."; else echo "켜져 있지 않습니다."; fi
