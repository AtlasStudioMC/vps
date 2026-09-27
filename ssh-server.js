// Minimal SSH server (no root needed). Login with SSH_USER / SSH_PASSWORD (Replit Secrets).
// The host key lives in DATA_DIR so it is backed up and Termius doesn't warn after a republish.
const { Server, utils } = require("ssh2");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const pty = require("node-pty");

module.exports = function startSsh({ dataDir, port, user, password }) {
  const hostKeyPath = path.join(dataDir, ".vps", "ssh_host_ed25519");
  fs.mkdirSync(path.dirname(hostKeyPath), { recursive: true, mode: 0o700 });
  if (!fs.existsSync(hostKeyPath)) {
    fs.writeFileSync(hostKeyPath, utils.generateKeyPairSync("ed25519").private, { mode: 0o600 });
  }

  const rc = path.join(__dirname, "vps", "bashrc");
  const h = (v) => crypto.createHash("sha256").update(String(v)).digest();
  const same = (a, b) => crypto.timingSafeEqual(h(a), h(b));

  const server = new Server({ hostKeys: [fs.readFileSync(hostKeyPath)] }, (client) => {
    client.on("error", () => {});
    client.on("authentication", (ctx) => {
      if (ctx.method !== "password") return ctx.reject(["password"]);
      const ok = same(ctx.username, user) & same(ctx.password, password);
      ok ? ctx.accept() : ctx.reject(["password"]);
    });
    client.on("ready", () => {
      client.on("session", (acceptSession) => {
        const session = acceptSession();
        const size = { cols: 80, rows: 24, term: "xterm-256color" };
        let term;
        const start = (stream, args) => {
          term = pty.spawn("bash", args, {
            name: size.term, cols: size.cols, rows: size.rows, cwd: dataDir, env: process.env,
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
        session.on("shell", (accept) => start(accept(), ["--rcfile", rc, "-i"]));
        session.on("exec", (accept, reject, info) => start(accept(), ["-c", `. "${rc}"; ${info.command}`]));
      });
    });
  });
  // Send each keystroke immediately instead of letting TCP batch small packets.
  server._srv && server._srv.on("connection", (sock) => sock.setNoDelay(true));
  server.listen(port, "127.0.0.1", () => console.log(`[ssh] listening on 127.0.0.1:${port}`));
};
