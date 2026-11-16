#!/bin/zsh
# Builds an unsigned release .ipa for sideloading with AltStore (AltStore signs it with your
# Apple ID when it installs). Uses app/.env.local, so the build talks to your Supabase.
# Output: ~/endgame/builds/Endgame-<version>.ipa
set -euo pipefail
cd "$(dirname "$0")/.."

[[ -f .env.local ]] || { echo "Missing app/.env.local (Supabase URL + key)"; exit 1; }
version=$(node -p "require('./app.json').expo.version")
work=$(mktemp -d)
out="$HOME/endgame/builds"
mkdir -p "$out"

CI=1 npx expo prebuild -p ios --clean
xcodebuild -workspace ios/Endgame.xcworkspace -scheme Endgame -configuration Release \
  -sdk iphoneos -destination 'generic/platform=iOS' -derivedDataPath "$work/dd" \
  CODE_SIGNING_ALLOWED=NO CODE_SIGNING_REQUIRED=NO -quiet

mkdir -p "$work/Payload"
cp -R "$work/dd/Build/Products/Release-iphoneos/Endgame.app" "$work/Payload/"
(cd "$work" && zip -qry "$out/Endgame-$version.ipa" Payload)
rm -rf "$work"
echo "Built $out/Endgame-$version.ipa"
