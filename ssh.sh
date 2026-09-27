#!/usr/bin/env bash
# Get a real SSH login to this Repl via tmate (no root, no open ports needed).
# Anyone with the printed ssh command gets your shell - keep it private.
set -e
mkdir -p ~/bin
if [ ! -x ~/bin/tmate ]; then
  curl -sL https://github.com/tmate-io/tmate/releases/download/2.4.0/tmate-2.4.0-static-linux-amd64.tar.xz | tar -xJ -C /tmp
  mv /tmp/tmate-2.4.0-static-linux-amd64/tmate ~/bin/tmate
fi
SOCK=/tmp/tmate.sock
~/bin/tmate -S $SOCK new-session -d
~/bin/tmate -S $SOCK wait tmate-ready
echo "SSH:  $(~/bin/tmate -S $SOCK display -p '#{tmate_ssh}')"
echo "Web:  $(~/bin/tmate -S $SOCK display -p '#{tmate_web}')"
