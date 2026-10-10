#!/bin/zsh
# "콘텐츠 스튜디오.app"을 만든다. 누르면 서버를 켜고 앱 창으로 연다.
# 앱 안에 이 폴더 경로가 들어가므로, content-studio 폴더를 옮겼다면 이 스크립트를 다시 실행한다.
cd "$(dirname "$0")/.." || exit 1
ROOT="$(pwd)"
APP="$ROOT/콘텐츠 스튜디오.app"
TMP="$(mktemp -d)"

# 1) 아이콘(.icns): public/icons/icon-1024.png에서 크기별로 만든다
ICONSET="$TMP/AppIcon.iconset"; mkdir -p "$ICONSET"
for s in 16 32 128 256 512; do
  sips -z $s $s public/icons/icon-1024.png --out "$ICONSET/icon_${s}x${s}.png" >/dev/null
  d=$((s*2)); sips -z $d $d public/icons/icon-1024.png --out "$ICONSET/icon_${s}x${s}@2x.png" >/dev/null
done
iconutil -c icns "$ICONSET" -o "$TMP/AppIcon.icns" || { echo "아이콘 변환 실패"; exit 1; }

# 2) 앱 본체(AppleScript 애플릿): launch.sh를 실행한다
ESCAPED="${ROOT//\"/\\\"}"
cat > "$TMP/main.applescript" <<OSA
do shell script "/bin/zsh -lc " & quoted form of ("'" & "$ESCAPED/scripts/launch.sh" & "' >/dev/null 2>&1 &")
OSA
rm -rf "$APP"
osacompile -o "$APP" "$TMP/main.applescript" || { echo "앱 만들기 실패"; exit 1; }

# 3) 아이콘과 이름 정보 넣기
cp "$TMP/AppIcon.icns" "$APP/Contents/Resources/applet.icns"
/usr/libexec/PlistBuddy -c "Set :CFBundleName 콘텐츠 스튜디오" "$APP/Contents/Info.plist" 2>/dev/null
/usr/libexec/PlistBuddy -c "Add :CFBundleIdentifier string com.contentstudio.launcher" "$APP/Contents/Info.plist" 2>/dev/null || \
  /usr/libexec/PlistBuddy -c "Set :CFBundleIdentifier com.contentstudio.launcher" "$APP/Contents/Info.plist"
# 최신 osacompile은 Assets.car 아이콘을 우선 쓰므로 지우고 applet.icns를 쓰게 한다
rm -f "$APP/Contents/Resources/Assets.car"
/usr/libexec/PlistBuddy -c "Delete :CFBundleIconName" "$APP/Contents/Info.plist" 2>/dev/null
/usr/libexec/PlistBuddy -c "Set :CFBundleIconFile applet" "$APP/Contents/Info.plist" 2>/dev/null
# 내용을 바꿨으니 로컬 서명을 다시 한다
codesign --force --deep -s - "$APP" >/dev/null 2>&1
touch "$APP"
rm -rf "$TMP"
echo "만들었습니다: $APP"
echo "Finder에서 응용 프로그램 폴더나 독으로 끌어다 두고 쓰면 됩니다."
