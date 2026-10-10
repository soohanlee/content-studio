#!/bin/zsh
# 더블클릭하면 콘텐츠 스튜디오를 켜고 앱 창으로 연다. 이미 켜져 있으면 창만 연다. 끄기: stop.command
exec "$(dirname "$0")/scripts/launch.sh"
