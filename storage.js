// Persists DATA_DIR to a Filebase (S3-compatible) bucket as one tar.gz so it survives republishes.
// Needs secrets: FILEBASE_KEY, FILEBASE_SECRET, FILEBASE_BUCKET.
const { S3Client, GetObjectCommand, PutObjectCommand, CreateBucketCommand } = require("@aws-sdk/client-s3");
const { execFileSync } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

const DATA_DIR = process.env.DATA_DIR || path.join(os.homedir(), "data");
const OBJECT = process.env.FILEBASE_OBJECT || "vps-backup.tar.gz";
const { FILEBASE_KEY, FILEBASE_SECRET, FILEBASE_BUCKET } = process.env;
const enabled = !!(FILEBASE_KEY && FILEBASE_SECRET && FILEBASE_BUCKET);

const s3 = enabled && new S3Client({
  endpoint: "https://s3.filebase.com",
  region: "us-east-1",
  forcePathStyle: true,
  credentials: { accessKeyId: FILEBASE_KEY, secretAccessKey: FILEBASE_SECRET },
});

async function restore() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!enabled) return console.log("[storage] Filebase secrets not set - data will NOT persist.");
  try {
    const r = await s3.send(new GetObjectCommand({ Bucket: FILEBASE_BUCKET, Key: OBJECT }));
    const tmp = path.join(os.tmpdir(), "vps-restore.tar.gz");
    fs.writeFileSync(tmp, Buffer.from(await r.Body.transformToByteArray()));
    execFileSync("tar", ["-xzf", tmp, "-C", DATA_DIR]);
    fs.rmSync(tmp);
    console.log(`[storage] Restored ${DATA_DIR} from Filebase`);
  } catch (e) {
    if (e.name === "NoSuchKey") console.log("[storage] No backup yet - starting fresh.");
    else if (e.name === "NoSuchBucket") {
      await s3.send(new CreateBucketCommand({ Bucket: FILEBASE_BUCKET }));
      console.log(`[storage] Created bucket ${FILEBASE_BUCKET} - starting fresh.`);
    }
    else console.error("[storage] Restore failed:", e.message);
  }
}

let busy = false;
async function backup() {
  if (!enabled || busy) return;
  busy = true;
  const tmp = path.join(os.tmpdir(), "vps-backup.tar.gz");
  try {
    execFileSync("tar", ["-czf", tmp, "-C", DATA_DIR, "."]);
    await s3.send(new PutObjectCommand({ Bucket: FILEBASE_BUCKET, Key: OBJECT, Body: fs.readFileSync(tmp) }));
    console.log(`[storage] Backed up to Filebase at ${new Date().toISOString()}`);
  } catch (e) {
    console.error("[storage] Backup failed:", e.message);
  } finally {
    busy = false;
    fs.rmSync(tmp, { force: true });
  }
}

module.exports = { DATA_DIR, restore, backup, enabled };
