#!/usr/bin/env bash
# Runs at app start: fetch neofetch and reinstall saved apt packages in the background.
D="${VPS_HOME:-$HOME/data}"; mkdir -p "$D/bin" "$D/.vps"
[ -x "$D/bin/neofetch" ] || { curl -sL https://raw.githubusercontent.com/dylanaraps/neofetch/master/neofetch -o "$D/bin/neofetch" && chmod +x "$D/bin/neofetch"; }
# one nix-env call for all packages is much faster than one per package
if [ -s "$D/.vps/packages" ]; then
  mapfile -t P < <(grep -v '^$' "$D/.vps/packages" | sed 's/^/nixpkgs./')
  nix-env -iA "${P[@]}" >/dev/null 2>&1 || for p in "${P[@]}"; do nix-env -iA "$p" >/dev/null 2>&1; done
fi
"$(dirname "$0")/bin/vps-wrap"
echo "[vps] packages ready"
