#!/usr/bin/env bash
# Usage: bash ssh-tunnel.sh            (asks you to choose an SSH password)
#    or: bash ssh-tunnel.sh 'ssh-ed25519 AAAA...'   (key login instead)
# Starts the SSH server and prints a public bore.pub:PORT address for Termius.
set -e
cd "$(dirname "$0")"
[ -d node_modules/ssh2 ] || npm install ssh2 --silent
mkdir -p ~/.ssh ~/bin && chmod 700 ~/.ssh && touch ~/.ssh/authorized_keys && chmod 600 ~/.ssh/authorized_keys
if [ -n "$1" ]; then grep -qxF "$1" ~/.ssh/authorized_keys || echo "$1" >> ~/.ssh/authorized_keys; fi
if [ ! -s ~/.ssh/authorized_keys ] && [ ! -s ~/.ssh/vps_password ]; then
  read -rsp "Choose an SSH password (8+ chars): " PW; echo
  if [ ${#PW} -lt 8 ]; then echo "Too short."; exit 1; fi
  printf '%s' "$PW" > ~/.ssh/vps_password && chmod 600 ~/.ssh/vps_password
  echo "Saved. (To change it later: rm ~/.ssh/vps_password and rerun.)"
fi
if [ ! -x ~/bin/bore ]; then
  URL=$(curl -s https://api.github.com/repos/ekzhang/bore/releases/latest | grep browser_download_url | grep x86_64-unknown-linux-musl | cut -d'"' -f4)
  curl -sL "$URL" | tar -xz -C ~/bin
fi
pkill -f "node ssh-server.js" 2>/dev/null || true
nohup node ssh-server.js > /tmp/ssh-server.log 2>&1 &
sleep 2
echo "In Termius: Host = bore.pub, Port = the number below, Username = runner, Password = the one you chose"
~/bin/bore local 2222 --to bore.pub
