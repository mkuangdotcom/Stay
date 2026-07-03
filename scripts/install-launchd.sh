#!/bin/zsh
# Installs the daily scrape as a macOS launchd job (09:23 every morning,
# runs on next wake if the Mac was asleep). Run once: ./scripts/install-launchd.sh
set -e
DIR="$(cd "$(dirname "$0")/.." && pwd)"
PLIST="$HOME/Library/LaunchAgents/com.stay.scrape.plist"
mkdir -p "$HOME/Library/LaunchAgents"
sed "s|__PROJECT_DIR__|$DIR|" "$DIR/scripts/launchd/com.stay.scrape.plist" > "$PLIST"
launchctl unload "$PLIST" 2>/dev/null || true
launchctl load "$PLIST"
echo "Installed. Daily scrape at 09:23 → logs in $DIR/.data/scrape.log"
echo "Remove with: launchctl unload $PLIST && rm $PLIST"
