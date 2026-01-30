Below is a **concrete, workable shape** for: **Node WebDAV server (virtual tree from Convex) + R2 blobs + rclone mount**, with **read + write**.

I’m going to show:

1. the _protocol surface area_ you need to implement
2. a _data contract_ between WebDAV ⇄ Convex ⇄ R2
3. a _Node skeleton_ using a WebDAV library, including **Range GET** and **writeback PUT**
4. the _rclone mount_ flags that make writes behave sanely

---

## 0) What rclone will do vs what you must do

If you mount a WebDAV server with rclone:

- `ls` / directory enumeration → WebDAV `PROPFIND` (you implement: list children + stat)
- read file → `GET` (you implement: Range support ideally)
- create/write file → `PUT` (you implement: accept bytes; then upload to R2; then commit metadata in Convex)
- rename/move → `MOVE`
- delete → `DELETE`
- make directory → `MKCOL`

**Key point for “read/write on object storage”:** you want _close-to-POSIX_ semantics. The typical approach is:

- **Writes are staged locally** (or in-memory up to a threshold), then **uploaded to R2 on close/commit**.
- rclone itself also has a VFS cache; you can choose how much you rely on rclone vs your server.

---

## 1) Suggested Convex “control plane” contract

Your WebDAV server will call Convex for these operations:

- `statPath(tenantId, path)` → `{type: "file"|"dir", size, mtime, fileId?, version?, objectKey?}`
- `listDir(tenantId, path)` → array of child entries (name + stat fields)
- `ensureDir(tenantId, path)` (or implicit dirs)
- `beginWrite(tenantId, path, opts)` → `{fileId, uploadToken, objectKeyTemp}` (creates/locks a pending version)
- `commitWrite(fileId, version, objectKeyFinal, size, etag/hash, mtime)` → marks ready + updates path mapping atomically
- `movePath(src, dst)`
- `deletePath(path)` (tombstone) + async GC

This lets Convex remain your source of truth for _namespaces, permissions, versions, and locking_.

---

## 2) R2 data plane

Use AWS SDK v3 `S3Client` pointed at R2:

- Reads: `GetObject` with `Range: bytes=start-end`
- Writes: `PutObject` (and optionally multipart for large files)

Object keys should be **opaque** and include `tenantId` + `fileId` + `version` so renames are metadata-only.

---

## 3) Node WebDAV server skeleton (read + write)

### Packages

- `webdav-server` (Node WebDAV implementation you can extend)
- `@aws-sdk/client-s3`
- whatever you use to call Convex (HTTP endpoint or Convex client in Node)

```bash
npm i webdav-server @aws-sdk/client-s3
```

### `server.ts` (core idea)

This is a **minimal but real** skeleton. You will need to flesh out Convex calls and auth.

```ts
import { v2 as webdav } from "webdav-server";
import {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pipeline } from "node:stream/promises";

// -------------------------
// R2 client
// -------------------------
const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID!;
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID!;
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY!;
const R2_BUCKET = process.env.R2_BUCKET!;

const s3 = new S3Client({
  region: "auto",
  endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: R2_ACCESS_KEY_ID,
    secretAccessKey: R2_SECRET_ACCESS_KEY,
  },
});

// -------------------------
// Convex “API” placeholders
// -------------------------
type Stat =
  | { type: "dir"; mtime: Date }
  | {
      type: "file";
      mtime: Date;
      size: number;
      fileId: string;
      version: number;
      objectKey: string;
    };

async function convexStatPath(
  tenantId: string,
  p: string
): Promise<Stat | null> {
  // TODO call Convex query
  return null;
}
async function convexListDir(
  tenantId: string,
  dir: string
): Promise<Array<{ name: string; stat: Stat }>> {
  // TODO call Convex query
  return [];
}
async function convexEnsureDir(tenantId: string, dir: string): Promise<void> {
  // TODO
}
async function convexBeginWrite(
  tenantId: string,
  p: string
): Promise<{ fileId: string; version: number; objectKey: string }> {
  // TODO: create/lock a pending version and return objectKey for upload
  return {
    fileId: "file_123",
    version: 1,
    objectKey: `tenants/${tenantId}/files/file_123/v1/blob`,
  };
}
async function convexCommitWrite(args: {
  tenantId: string;
  path: string;
  fileId: string;
  version: number;
  objectKey: string;
  size: number;
  mtime: Date;
  etag?: string;
}): Promise<void> {
  // TODO: mark version ready + update path mapping atomically
}
async function convexMovePath(
  tenantId: string,
  src: string,
  dst: string
): Promise<void> {
  // TODO
}
async function convexDeletePath(tenantId: string, p: string): Promise<void> {
  // TODO tombstone
}

// -------------------------
// Helpers
// -------------------------
function parseRange(rangeHeader: string | undefined, size: number) {
  // Supports single range: "bytes=start-end" or "bytes=start-" or "bytes=-suffix"
  if (!rangeHeader) return null;
  const m = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader.trim());
  if (!m) return null;

  const startStr = m[1];
  const endStr = m[2];

  let start: number;
  let end: number;

  if (startStr === "" && endStr !== "") {
    // suffix: last N bytes
    const suffix = Number(endStr);
    if (!Number.isFinite(suffix) || suffix <= 0) return null;
    start = Math.max(0, size - suffix);
    end = size - 1;
  } else {
    start = Number(startStr);
    end = endStr === "" ? size - 1 : Number(endStr);
    if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
    if (start < 0 || end < start) return null;
    end = Math.min(end, size - 1);
  }

  return { start, end };
}

function tenantIdFromRequest(ctx: webdav.WebDAVRequestContext): string {
  // TODO: derive from auth (Basic/Bearer) or hostname, etc.
  // rclone can send Authorization; you validate and map to tenant.
  return "tenant_abc";
}

// -------------------------
// WebDAV server
// -------------------------
const server = new webdav.WebDAVServer({
  port: 1900,
  // You almost certainly want HTTPS in real deployments.
});

// Very simple auth example: allow all (replace this)
server.beforeRequest((arg, next) => {
  // TODO: validate Authorization header and set ctx.user if needed
  next();
});

// Custom filesystem by overriding handlers at HTTP layer is often simpler
// than deeply extending the virtual filesystem objects for a first pass.
server.setFileSystem("/", new webdav.VirtualFileSystem(), () => {});

// -------------------------
// PROPFIND (list + stat)
// -------------------------
server.method("PROPFIND", async (ctx, next) => {
  const tenantId = tenantIdFromRequest(ctx);
  const urlPath = ctx.requested.path.toString(); // e.g. /docs/a.txt

  const stat = await convexStatPath(tenantId, urlPath);
  if (!stat) {
    ctx.setCode(404);
    return;
  }

  // Depth header: 0 = just the resource; 1 = include children
  const depth = ctx.headers.find("depth")?.value ?? "infinity";
  const includeChildren = depth === "1";

  const children =
    includeChildren && stat.type === "dir"
      ? await convexListDir(tenantId, urlPath)
      : [];

  // Build a multistatus response
  const responses: any[] = [];

  function mkProp(p: string, s: Stat) {
    const isDir = s.type === "dir";
    const href = p.endsWith("/") || !isDir ? p : p + "/";
    return {
      href,
      props: [
        {
          status: "HTTP/1.1 200 OK",
          prop: {
            "d:resourcetype": isDir ? { "d:collection": {} } : {},
            "d:getcontentlength": isDir ? undefined : (s as any).size,
            "d:getlastmodified": s.mtime.toUTCString(),
          },
        },
      ],
    };
  }

  responses.push(mkProp(urlPath, stat));
  for (const c of children) {
    const childPath = path.posix.join(urlPath, c.name);
    responses.push(mkProp(childPath, c.stat));
  }

  ctx.response.setHeader("Content-Type", "application/xml; charset=utf-8");
  ctx.setCode(207);
  ctx.response.write(webdav.XML.multistatus(responses));
  ctx.response.end();
});

// -------------------------
// GET (Range support; stream from R2)
// -------------------------
server.method("GET", async (ctx, next) => {
  const tenantId = tenantIdFromRequest(ctx);
  const urlPath = ctx.requested.path.toString();

  const stat = await convexStatPath(tenantId, urlPath);
  if (!stat || stat.type !== "file") {
    ctx.setCode(404);
    return;
  }

  const rangeHeader = ctx.headers.find("range")?.value;
  const r = parseRange(rangeHeader, stat.size);
  const range = r ? `bytes=${r.start}-${r.end}` : undefined;

  const cmd = new GetObjectCommand({
    Bucket: R2_BUCKET,
    Key: stat.objectKey,
    Range: range,
  });

  const out = await s3.send(cmd);

  // Headers
  ctx.response.setHeader("Accept-Ranges", "bytes");
  ctx.response.setHeader(
    "Content-Length",
    String(r ? r.end - r.start + 1 : stat.size)
  );

  if (r) {
    ctx.setCode(206);
    ctx.response.setHeader(
      "Content-Range",
      `bytes ${r.start}-${r.end}/${stat.size}`
    );
  } else {
    ctx.setCode(200);
  }

  // Stream body
  // out.Body is a stream in Node
  // @ts-ignore
  await pipeline(out.Body, ctx.response);
});

// -------------------------
// PUT (writeback: stage to temp, then upload to R2, then commit Convex)
// -------------------------
server.method("PUT", async (ctx, next) => {
  const tenantId = tenantIdFromRequest(ctx);
  const urlPath = ctx.requested.path.toString();

  // Stage incoming bytes to temp file
  const tmpDir = path.join(os.tmpdir(), "dav-writeback");
  fs.mkdirSync(tmpDir, { recursive: true });
  const tmpPath = path.join(
    tmpDir,
    `upload-${Date.now()}-${Math.random().toString(16).slice(2)}`
  );

  const ws = fs.createWriteStream(tmpPath);
  await pipeline(ctx.request, ws);

  const st = fs.statSync(tmpPath);
  const mtime = new Date();

  // Begin + upload + commit
  const { fileId, version, objectKey } = await convexBeginWrite(
    tenantId,
    urlPath
  );

  const body = fs.createReadStream(tmpPath);
  const put = new PutObjectCommand({
    Bucket: R2_BUCKET,
    Key: objectKey,
    Body: body,
    // ContentType: ctx.headers.find("content-type")?.value,
  });

  const putRes = await s3.send(put);

  await convexCommitWrite({
    tenantId,
    path: urlPath,
    fileId,
    version,
    objectKey,
    size: st.size,
    mtime,
    etag: putRes.ETag,
  });

  fs.unlink(tmpPath, () => {});
  ctx.setCode(201);
  ctx.response.end();
});

// -------------------------
// MKCOL (mkdir)
// -------------------------
server.method("MKCOL", async (ctx, next) => {
  const tenantId = tenantIdFromRequest(ctx);
  const urlPath = ctx.requested.path.toString();
  await convexEnsureDir(tenantId, urlPath);
  ctx.setCode(201);
  ctx.response.end();
});

// -------------------------
// MOVE (rename/move)
// -------------------------
server.method("MOVE", async (ctx, next) => {
  const tenantId = tenantIdFromRequest(ctx);
  const src = ctx.requested.path.toString();
  const dst = ctx.headers.find("destination")?.value;

  if (!dst) {
    ctx.setCode(400);
    return;
  }

  // destination is a full URL sometimes; normalize to path
  const dstPath = new URL(dst, "http://localhost").pathname;

  await convexMovePath(tenantId, src, dstPath);
  ctx.setCode(201);
  ctx.response.end();
});

// -------------------------
// DELETE
// -------------------------
server.method("DELETE", async (ctx, next) => {
  const tenantId = tenantIdFromRequest(ctx);
  const urlPath = ctx.requested.path.toString();
  await convexDeletePath(tenantId, urlPath);
  ctx.setCode(204);
  ctx.response.end();
});

server.start(() => {
  console.log("WebDAV listening on http://127.0.0.1:1900/");
});
```

### Notes you should not skip

- **Auth**: rclone will send credentials. Enforce tenant boundary in WebDAV _and_ in Convex (defense in depth).
- **Range GET**: essential for performance; editors and many programs seek.
- **PUT staging**: this example writes the whole file to disk then uploads. That’s the most robust baseline for “write” semantics.
- **Large files**: for multi-GB files you’ll want multipart upload (threshold + part size).

---

## 4) rclone mount command (write semantics)

Mount your WebDAV server:

```bash
rclone mount webdav: /mnt/vfs \
  --webdav-url http://127.0.0.1:1900 \
  --webdav-user youruser \
  --webdav-pass yourpass \
  --vfs-cache-mode full \
  --vfs-write-back 30s \
  --vfs-cache-max-size 200G \
  --dir-cache-time 30s \
  --poll-interval 0
```

Why `--vfs-cache-mode full`?

- It makes random writes / seeks far more compatible (rclone will cache locally and then upload via WebDAV PUT patterns).

You can tighten caching depending on your needs, but for “works like a filesystem” on object storage, `full` is the least surprising.

---

## 5) The two hard problems (and the standard solutions)

### A) Concurrent writers / locking

If two clients write the same file:

- Decide: **last write wins**, or **versioned writes**.
- In `convexBeginWrite`, create a write lease (e.g. `lockedBy`, `lockedUntil`) and reject or create new version.

### B) Partial updates / appends

POSIX allows in-place modifications. Object storage doesn’t.

- Your staging approach solves this: you always write a complete new object.
- Renames become metadata-only (Convex updates path mapping).

---

## If you want, I’ll give you the “production set” changes

If you answer these two, I’ll tailor the next iteration:

1. Max file size? (e.g. 1 GB vs 200 GB)
2. Do you need macOS clients mounting too, or Linux only?

Based on that, I’ll add:

- multipart upload path + resumable behavior
- proper WebDAV XML PROPFIND responses (some clients are picky)
- ETag/If-Match handling
- a GC worker for orphaned pending uploads in Convex + R2 cleanup
