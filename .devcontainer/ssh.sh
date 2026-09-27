#!/usr/bin/env bash
# Codespaces: real Ubuntu with sudo. Starts password SSH + a bore.pub tunnel for Termius.
# Needs Codespaces secrets SSH_PASSWORD (and optional BORE_PORT) at github.com/settings/codespaces
set -e
LOG=/tmp/vps-ssh.log
if [ -z "$SSH_PASSWORD" ]; then echo "Add an SSH_PASSWORD Codespaces secret, then rebuild." | tee $LOG; exit 0; fi
command -v sshd >/dev/null || { sudo apt-get update -qq && sudo apt-get install -y -qq openssh-server >/dev/null; }
echo "$(whoami):$SSH_PASSWORD" | sudo chpasswd
sudo mkdir -p /run/sshd
sudo tee /etc/ssh/sshd_config.d/vps.conf >/dev/null <<CONF
Port 2222
PasswordAuthentication yes
KbdInteractiveAuthentication yes
CONF
sudo pkill -f "sshd -D" 2>/dev/null || true
sudo /usr/sbin/sshd
if [ ! -x ~/.local/bin/bore ]; then
  mkdir -p ~/.local/bin
  curl -sL https://github.com/ekzhang/bore/releases/download/v0.5.2/bore-v0.5.2-x86_64-unknown-linux-musl.tar.gz | tar -xz -C ~/.local/bin
fi
pkill -f "bore local 2222" 2>/dev/null || true
ARGS=(local 2222 --to bore.pub); [ -n "$BORE_PORT" ] && ARGS+=(--port "$BORE_PORT")
nohup bash -c "while true; do ~/.local/bin/bore ${ARGS[*]}; sleep 5; done" > $LOG 2>&1 &
sleep 3
echo "Termius -> Host: bore.pub  Port: ${BORE_PORT:-see $LOG}  User: $(whoami)  Password: your SSH_PASSWORD" | tee -a $LOG
