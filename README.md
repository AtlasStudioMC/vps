# Free VPS on Replit

A password-protected web terminal. Import this repo into Replit and you get a real
Linux shell in your browser (install packages, run servers, use git, etc.).

## Setup
1. Go to https://replit.com → **Create Repl → Import from GitHub** → paste
   `https://github.com/AtlasStudioMC/vps`
2. Open **Secrets** (padlock icon) and add `VPS_PASSWORD` = a strong password.
3. Click **Run**. Open the webview URL, enter your password, and you're in.

## Keep it online
Free Repls sleep when idle. Options: use Replit **Deployments** (Reserved VM, paid), or
ping the URL periodically with a free uptime monitor (e.g. UptimeRobot).

## Notes
- Not a real VPS: no root, limited CPU/RAM, and storage/uptime depend on your Replit plan.
- Never run this without a strong `VPS_PASSWORD` — it gives full shell access.
- Login locks for 60s after 5 wrong attempts.
