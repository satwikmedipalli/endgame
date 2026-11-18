#!/bin/zsh
# One-time setup of Endgame on this Mac. Run from anywhere:
#   zsh ~/endgame/endgame/mac/scripts/setup-mac.sh
# It retires the old iPhone-era pieces, installs, tests, and puts Endgame.app in /Applications.
set -e
cd "$(dirname "$0")/../.."   # endgame/

step() { print -P "\n%B$1%b"; }

step "1/6  Stopping the old background helper (it runs inside the app now)"
launchctl bootout "gui/$(id -u)/com.endgame.helper" 2>/dev/null || true
rm -f ~/Library/LaunchAgents/com.endgame.helper.plist
echo "done"

step "2/6  Developer tools: Command Line Tools instead of Xcode"
if [[ "$(xcode-select -p 2>/dev/null)" != /Library/Developer/CommandLineTools* ]]; then
  echo "Pointing git and friends at the Command Line Tools (asks for your password)…"
  sudo xcode-select -s /Library/Developer/CommandLineTools
fi
if [[ -d /Applications/Xcode.app ]]; then
  read "answer?Delete /Applications/Xcode.app (about 10 GB, not needed by Endgame)? [y/N] "
  if [[ "$answer" == [yY]* ]]; then
    sudo rm -rf /Applications/Xcode.app
    echo "Xcode removed."
  fi
fi

step "3/6  Installing packages"
npm install

step "4/6  Tests and type checks"
npm test
npm run typecheck

step "5/6  Supabase: adding the puzzle card kind"
# --remote: your linked project on supabase.com, not a local Docker database.
npx supabase db push --remote || echo "Skipped. Run 'npx supabase db push --remote' in ~/endgame/endgame later (puzzles need it)."

step "6/6  Building Endgame.app into /Applications"
npm run install-app
open -a Endgame
print -P "\n%BEndgame is installed.%b It's in Launchpad and Spotlight, and in the menu bar while it runs."
