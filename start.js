// Boots the whole "VPS": restore data from Filebase, web terminal, SSH server, public bore tunnel,
// and periodic + on-shutdown backups.
const { execSync, spawn } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");
const storage = require("./storage");

const SSH_PORT = Number(process.env.SSH_PORT || 2222);
const BORE_PORT = process.env.BORE_PORT; // fixed public port on bore.pub, e.g. 42022
const BACKUP_MINUTES = Number(process.env.BACKUP_MINUTES || 5);
const SSH_USER = process.env.SSH_USER || "root";

function ensureBore() {
  const bin = path.join(os.homedir(), "bin", "bore");
  if (fs.existsSync(bin)) return bin;
  fs.mkdirSync(path.dirname(bin), { recursive: true });
  execSync(
    `curl -sL https://github.com/ekzhang/bore/releases/download/v0.5.2/bore-v0.5.2-x86_64-unknown-linux-musl.tar.gz | tar -xz -C ${path.dirname(bin)}`
  );
  return bin;
}

function startTunnel() {
  const args = ["local", String(SSH_PORT), "--to", "bore.pub"];
  if (BORE_PORT) args.push("--port", BORE_PORT);
  const p = spawn(ensureBore(), args);
  const log = (d) => {
    const s = d.toString();
    const m = s.match(/remote_port=(\d+)/);
    if (m) console.log(`\n[ssh] Termius -> Host: bore.pub  Port: ${m[1]}  User: ${SSH_USER}\n`);
    else process.stdout.write("[bore] " + s);
  };
  p.stdout.on("data", log);
  p.stderr.on("data", log);
  p.on("exit", () => setTimeout(startTunnel, 5000)); // reconnect if bore drops
}

// When published on Autoscale, keep a request to ourselves open so the instance stays
// awake with full CPU. Disable with KEEPALIVE=0.
async function keepAlive() {
  const domain = (process.env.REPLIT_DOMAINS || "").split(",")[0];
  if (!process.env.REPLIT_DEPLOYMENT || !domain || process.env.KEEPALIVE === "0") return;
  for (;;) {
    try {
      const r = await fetch(`https://${domain}/keepalive`);
      for await (const _ of r.body) {} // holds until the platform closes it
    } catch {}
    await new Promise((ok) => setTimeout(ok, 2000));
  }
}

(async () => {
  await storage.restore();
  process.env.VPS_HOME = storage.DATA_DIR;
  // neofetch + reinstall packages saved by `apt install` (background, doesn't delay startup)
  spawn("bash", [path.join(__dirname, "vps", "boot.sh")], { stdio: "inherit" });

  require("./server"); // web terminal

  if (process.env.SSH_PASSWORD) {
    require("./ssh-server")({
      dataDir: storage.DATA_DIR, port: SSH_PORT, user: SSH_USER, password: process.env.SSH_PASSWORD,
    });
    startTunnel();
  } else {
    console.log("[ssh] Set SSH_PASSWORD in Secrets to enable SSH.");
  }

  keepAlive();
  setInterval(storage.backup, BACKUP_MINUTES * 60000);
  let stopping = false;
  const shutdown = async () => {
    if (stopping) return;
    stopping = true;
    await storage.backup();
    process.exit(0);
  };
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
})();
