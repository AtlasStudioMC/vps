#!/usr/bin/env bash
# Usage: bash ssh-tunnel.sh 'ssh-ed25519 AAAA... your-termius-key'
# Starts the SSH server and prints a public bore.pub:PORT address for Termius.
set -e
cd "$(dirname "$0")"
[ -d node_modules/ssh2 ] || npm install ssh2 --silent
mkdir -p ~/.ssh ~/bin && chmod 700 ~/.ssh && touch ~/.ssh/authorized_keys && chmod 600 ~/.ssh/authorized_keys
if [ -n "$1" ]; then grep -qxF "$1" ~/.ssh/authorized_keys || echo "$1" >> ~/.ssh/authorized_keys; fi
if [ ! -s ~/.ssh/authorized_keys ]; then
  echo "No key yet. Run: bash ssh-tunnel.sh 'ssh-ed25519 AAAA... (your Termius public key)'"; exit 1
fi
if [ ! -x ~/bin/bore ]; then
  URL=$(curl -s https://api.github.com/repos/ekzhang/bore/releases/latest | grep browser_download_url | grep x86_64-unknown-linux-musl | cut -d'"' -f4)
  curl -sL "$URL" | tar -xz -C ~/bin
fi
pkill -f "node ssh-server.js" 2>/dev/null || true
nohup node ssh-server.js > /tmp/ssh-server.log 2>&1 &
sleep 2
echo "In Termius: Host = bore.pub, Port = the number below, Username = runner, Key = your Termius key"
~/bin/bore local 2222 --to bore.pub
