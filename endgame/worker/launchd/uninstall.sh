#!/bin/zsh
LABEL=com.endgame.helper
launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
rm -f "$HOME/Library/LaunchAgents/$LABEL.plist"
echo "Removed the Endgame helper login item."
