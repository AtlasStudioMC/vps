#!/usr/bin/env bash
# Runs at app start: fetch neofetch and reinstall saved apt packages in the background.
D="${VPS_HOME:-$HOME/data}"; mkdir -p "$D/bin" "$D/.vps"
[ -x "$D/bin/neofetch" ] || { curl -sL https://raw.githubusercontent.com/dylanaraps/neofetch/master/neofetch -o "$D/bin/neofetch" && chmod +x "$D/bin/neofetch"; }
[ -s "$D/.vps/packages" ] && while read -r p; do [ -n "$p" ] && nix-env -iA "nixpkgs.$p" >/dev/null 2>&1; done < "$D/.vps/packages"
echo "[vps] packages ready"
