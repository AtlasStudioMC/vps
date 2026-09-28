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

// playit.gg: free tunnel with servers worldwide (much lower lag than bore.pub).
// Needs a PLAYIT_SECRET secret; the TCP tunnel -> 127.0.0.1:2222 is set up on playit.gg.
function startPlayit() {
  const bin = path.join(os.homedir(), "bin", "playit");
  if (!fs.existsSync(bin)) {
    fs.mkdirSync(path.dirname(bin), { recursive: true });
    execSync(`curl -sL -o ${bin} https://github.com/playit-cloud/playit-agent/releases/download/v1.0.10/playit-linux-amd64 && chmod +x ${bin}`);
  }
  const p = spawn(bin, ["--secret", process.env.PLAYIT_SECRET]);
  p.stdout.on("data", (d) => process.stdout.write("[playit] " + d));
  p.stderr.on("data", (d) => process.stdout.write("[playit] " + d));
  p.on("exit", () => setTimeout(startPlayit, 5000));
}

// Tailscale (userspace, no root): Termius on a device in the same tailnet connects to
// this machine's 100.x address, directly or via a nearby relay - far less lag than bore.
// Needs a TS_AUTHKEY secret. Incoming tailnet connections are forwarded to 127.0.0.1.
function startTailscale() {
  const dir = path.join(os.homedir(), "tailscale");
  const ts = path.join(dir, "tailscale"), tsd = path.join(dir, "tailscaled");
  if (!fs.existsSync(tsd)) {
    fs.mkdirSync(dir, { recursive: true });
    execSync(
      `curl -sL https://pkgs.tailscale.com/stable/$(curl -s 'https://pkgs.tailscale.com/stable/?mode=json' | grep -o 'tailscale_[0-9.]*_amd64.tgz' | head -1) | tar -xz --strip-components=1 -C ${dir}`
    );
  }
  // In-memory state: Autoscale can run old and new instances side by side, and a shared
  // (backed-up) node key makes them fight ("Duplicate node key"). Use an ephemeral auth key
  // so offline instances are removed and the name "replit-vps" stays free.
  const sock = path.join(os.tmpdir(), "tailscaled.sock");
  const d = spawn(tsd, ["--tun=userspace-networking", "--state=mem:", `--socket=${sock}`]);
  d.stderr.on("data", () => {});
  d.on("exit", () => setTimeout(startTailscale, 5000));
  setTimeout(() => {
    try {
      execSync(`${ts} --socket=${sock} up --authkey=${process.env.TS_AUTHKEY} --hostname=replit-vps`, { stdio: "ignore" });
      const ip = execSync(`${ts} --socket=${sock} ip -4`).toString().trim();
      console.log(`\n[tailscale] Termius -> Host: ${ip} (or replit-vps)  Port: ${SSH_PORT}  User: ${SSH_USER}\n`);
    } catch (e) {
      console.error("[tailscale] up failed:", e.message);
    }
  }, 3000);
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
    if (process.env.PLAYIT_SECRET) startPlayit();
    if (process.env.TS_AUTHKEY) startTailscale();
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
