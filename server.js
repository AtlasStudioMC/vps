const express = require("express");
const http = require("http");
const crypto = require("crypto");
const path = require("path");
const pty = require("node-pty");
const { WebSocketServer } = require("ws");

const PASSWORD = process.env.VPS_PASSWORD;
if (!PASSWORD) {
  console.error("Set VPS_PASSWORD in Replit Secrets (padlock icon) before starting.");
  process.exit(1);
}
const PORT = process.env.PORT || 3000;
const tokens = new Set();

const safeEqual = (a, b) => {
  const ha = crypto.createHash("sha256").update(String(a)).digest();
  const hb = crypto.createHash("sha256").update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
};

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

let fails = 0, lockUntil = 0;
app.post("/login", (req, res) => {
  if (Date.now() < lockUntil) return res.status(429).json({ error: "Too many attempts, wait." });
  if (safeEqual(req.body.password || "", PASSWORD)) {
    fails = 0;
    const t = crypto.randomBytes(32).toString("hex");
    tokens.add(t);
    return res.json({ token: t });
  }
  if (++fails >= 5) { lockUntil = Date.now() + 60000; fails = 0; }
  res.status(401).json({ error: "Wrong password" });
});

const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: "/term" });

wss.on("connection", (ws, req) => {
  const token = new URL(req.url, "http://x").searchParams.get("token");
  if (!tokens.has(token)) return ws.close(1008, "unauthorized");

  const shell = pty.spawn("bash", [], {
    name: "xterm-256color", cols: 80, rows: 24,
    cwd: process.env.HOME || process.cwd(), env: process.env,
  });
  shell.onData((d) => ws.readyState === 1 && ws.send(d));
  shell.onExit(() => ws.close());
  ws.on("message", (m) => {
    const s = m.toString();
    if (s.startsWith("\x00resize:")) {
      const [c, r] = s.slice(8).split(",").map(Number);
      if (c > 0 && r > 0) shell.resize(c, r);
    } else shell.write(s);
  });
  ws.on("close", () => shell.kill());
});

server.listen(PORT, "0.0.0.0", () => console.log(`VPS terminal on port ${PORT}`));
