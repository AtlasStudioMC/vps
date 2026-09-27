// Minimal SSH server (no root needed). Auth: keys in ~/.ssh/authorized_keys and/or
// the password stored in ~/.ssh/vps_password (set by ssh-tunnel.sh).
const { Server, utils } = require("ssh2");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const pty = require("node-pty");

const HOME = process.env.HOME;
const PORT = Number(process.env.SSH_PORT || 2222);
const hostKeyPath = path.join(HOME, ".ssh", "vps_host_ed25519");
fs.mkdirSync(path.dirname(hostKeyPath), { recursive: true, mode: 0o700 });
if (!fs.existsSync(hostKeyPath)) {
  fs.writeFileSync(hostKeyPath, utils.generateKeyPairSync("ed25519").private, { mode: 0o600 });
}

const passwordPath = path.join(HOME, ".ssh", "vps_password");
function passwordOk(given) {
  let real;
  try { real = fs.readFileSync(passwordPath, "utf8").trim(); } catch { return false; }
  if (!real) return false;
  const h = (v) => crypto.createHash("sha256").update(String(v)).digest();
  return crypto.timingSafeEqual(h(given), h(real));
}

function allowedKeys() {
  try {
    return fs.readFileSync(path.join(HOME, ".ssh", "authorized_keys"), "utf8")
      .split("\n").map((l) => l.trim()).filter((l) => l && !l.startsWith("#"))
      .map((l) => utils.parseKey(l)).filter((k) => !(k instanceof Error));
  } catch { return []; }
}

new Server({ hostKeys: [fs.readFileSync(hostKeyPath)] }, (client) => {
  client.on("error", () => {});
  client.on("authentication", (ctx) => {
    if (ctx.method === "password") return passwordOk(ctx.password) ? ctx.accept() : ctx.reject();
    if (ctx.method !== "publickey") return ctx.reject(["password", "publickey"]);
    const key = allowedKeys().find((k) => k.getPublicSSH().equals(ctx.key.data));
    if (!key) return ctx.reject();
    if (ctx.signature && key.verify(ctx.blob, ctx.signature, ctx.hashAlgo) !== true) return ctx.reject();
    ctx.accept();
  });
  client.on("ready", () => {
    client.on("session", (acceptSession) => {
      const session = acceptSession();
      const size = { cols: 80, rows: 24, term: "xterm-256color" };
      let term;
      const start = (stream, args) => {
        term = pty.spawn("bash", args, {
          name: size.term, cols: size.cols, rows: size.rows, cwd: HOME, env: process.env,
        });
        term.onData((d) => stream.write(d));
        stream.on("data", (d) => term.write(d.toString()));
        term.onExit(({ exitCode }) => { stream.exit(exitCode || 0); stream.end(); });
        stream.on("close", () => { try { term.kill(); } catch {} });
      };
      session.on("pty", (accept, reject, info) => {
        size.cols = info.cols; size.rows = info.rows; size.term = info.term || size.term;
        accept && accept();
      });
      session.on("window-change", (accept, reject, info) => {
        size.cols = info.cols; size.rows = info.rows;
        term && term.resize(info.cols, info.rows);
        accept && accept();
      });
      session.on("shell", (accept) => start(accept(), ["-l"]));
      session.on("exec", (accept, reject, info) => start(accept(), ["-lc", info.command]));
    });
  });
}).listen(PORT, "127.0.0.1", () => console.log(`SSH server on 127.0.0.1:${PORT}`));
