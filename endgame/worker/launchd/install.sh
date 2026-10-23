#!/bin/zsh
# Installs the Endgame helper as a login item (launchd). It starts at login, restarts
# if it crashes, and only runs while the Mac is awake. Re-run after moving the folder.
set -e
DIR="$(cd "$(dirname "$0")/.." && pwd)"
LABEL=com.endgame.helper
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
NODE="$(command -v node)"
CLAUDE_DIR="$(dirname "$(command -v claude)")"
mkdir -p "$DIR/logs" "$HOME/Library/LaunchAgents"
sed -e "s#__DIR__#$DIR#g" -e "s#__NODE__#$NODE#g" -e "s#__PATH__#$CLAUDE_DIR:$(dirname "$NODE"):/usr/bin:/bin:/usr/sbin:/sbin#g" \
  "$DIR/launchd/$LABEL.plist" > "$PLIST"
launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "$PLIST"
echo "Installed. Logs: $DIR/logs/helper.log"
