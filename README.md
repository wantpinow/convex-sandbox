# Convex Sandbox

A cloud filesystem you can mount inside Docker containers. Each **sandbox** is an
isolated virtual filesystem — files are stored in Cloudflare R2 (object storage)
with metadata tracked in Convex (a real-time database). You interact with the
files through a standard protocol called **WebDAV**, which lets you mount the
remote filesystem like a local folder.

```
┌──────────────────────────────────────────────────────────────────────┐
│                         Your Machine                                │
│                                                                     │
│   ┌──────────────┐    ┌──────────────────────────────────────────┐  │
│   │  Browser      │    │  Docker Container                       │  │
│   │  localhost:3000│    │                                         │  │
│   │               │    │  /mnt/sandbox/          (mounted folder) │  │
│   │  Create/delete│    │    readme.txt                            │  │
│   │  sandboxes    │    │    src/                                  │  │
│   │               │    │      main.py                             │  │
│   └──────┬───────┘    └───────────┬──────────────────────────────┘  │
│          │                        │                                  │
│          │ Convex API             │ WebDAV (HTTP)                    │
│          │                        │                                  │
│   ┌──────▼────────────────────────▼──────────────────────────────┐  │
│   │              WebDAV Server (localhost:1900)                   │  │
│   │                                                              │  │
│   │   Translates file operations (read, write, move, delete)     │  │
│   │   into database + object storage calls                       │  │
│   └──────────┬──────────────────────────────┬────────────────────┘  │
│              │                              │                        │
└──────────────┼──────────────────────────────┼────────────────────────┘
               │                              │
               ▼                              ▼
     ┌──────────────────┐          ┌───────────────────┐
     │  Convex (Cloud)  │          │  Cloudflare R2    │
     │                  │          │  (Cloud)          │
     │  File metadata:  │          │                   │
     │  - paths         │          │  File contents:   │
     │  - sizes         │          │  - binary blobs   │
     │  - timestamps    │          │                   │
     │  - sandbox IDs   │          │                   │
     └──────────────────┘          └───────────────────┘
```

---

## Table of Contents

- [Background Concepts](#background-concepts)
- [How the Pieces Fit Together](#how-the-pieces-fit-together)
- [What Happens When You Read a File](#what-happens-when-you-read-a-file)
- [What Happens When You Write a File](#what-happens-when-you-write-a-file)
- [Sandboxes and Isolation](#sandboxes-and-isolation)
- [Project Structure](#project-structure)
- [Setup](#setup)
- [Usage](#usage)
- [Running Tests](#running-tests)

---

## Background Concepts

### What is a filesystem?

When you use your computer, you see files and folders. Behind the scenes, your
operating system keeps track of where each file lives (its **path**, like
`/home/user/notes.txt`), how big it is, when it was last changed, and where
the actual bytes are stored on disk. This bookkeeping system is called a
**filesystem**.

### What is a virtual filesystem?

A virtual filesystem looks exactly like a normal folder on your computer, but
the files aren't stored on your local hard drive. Instead, every time you
open, save, or delete a file, the request is sent over the network to a remote
server. The server handles the actual storage and sends back the results.

From your perspective (or from the perspective of any program running on your
machine), it looks and behaves like a regular folder. You can `cd` into it,
`ls` files, `cat` them, `vim` them — the OS handles the translation transparently.

### What is WebDAV?

**WebDAV** (Web Distributed Authoring and Versioning) is a protocol built on
top of HTTP. It extends the familiar GET/PUT methods with operations designed
for filesystems:

| HTTP Method | What it does                        | Filesystem equivalent  |
|-------------|-------------------------------------|------------------------|
| `GET`       | Download a file                     | `cat file.txt`         |
| `PUT`       | Upload / create a file              | `echo "hi" > file.txt` |
| `DELETE`    | Remove a file or directory          | `rm file.txt`          |
| `MKCOL`     | Create a directory                  | `mkdir mydir`          |
| `MOVE`      | Rename or move a file               | `mv old.txt new.txt`   |
| `PROPFIND`  | List files and their properties     | `ls -la`               |
| `HEAD`      | Get file metadata without the body  | `stat file.txt`        |
| `OPTIONS`   | Ask the server what it supports     | (no direct equivalent) |

WebDAV is supported by Linux (`davfs2`), macOS (Finder), and Windows (native)
— so any of these can mount a remote WebDAV server as a local drive.

### What is davfs2?

`davfs2` is a Linux tool that mounts a WebDAV server as a local folder. When
a program reads `/mnt/sandbox/readme.txt`, davfs2 intercepts that read, sends
a `GET /readme.txt` HTTP request to the WebDAV server, and returns the response
as if the file were stored locally.

### What is Convex?

Convex is a cloud database with real-time subscriptions. In this project it
stores the **metadata** for every file and directory: path, name, size,
timestamps, type (file or directory), and which sandbox it belongs to. It does
**not** store the file contents — those go to R2.

### What is Cloudflare R2?

R2 is an S3-compatible object storage service. It stores the actual binary
content (bytes) of each file. Each file gets a unique key like
`my-sandbox/docs/readme.txt::v1`. The WebDAV server uploads to R2 on writes
and downloads from R2 on reads.

---

## How the Pieces Fit Together

There are four layers in the system:

```
┌─────────────────────────────────────────────────────────────────┐
│  Layer 1: Client (Docker container or curl)                     │
│                                                                 │
│  Makes standard filesystem calls (open, read, write, readdir).  │
│  davfs2 converts these into WebDAV HTTP requests.               │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             │  HTTP (WebDAV protocol)
                             │
                             │  Example: PUT /my-sandbox/hello.txt
                             │           Body: "hello world"
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│  Layer 2: WebDAV Server (Node.js, port 1900)                    │
│                                                                 │
│  Parses the HTTP request, extracts the sandbox ID and file      │
│  path, validates the sandbox exists, and delegates to the       │
│  appropriate handler (GET, PUT, DELETE, etc).                    │
└──────────┬─────────────────────────────────────┬────────────────┘
           │                                     │
           │  Convex HTTP API                    │  S3-compatible API
           │  (metadata operations)              │  (blob operations)
           │                                     │
           ▼                                     ▼
┌─────────────────────────┐          ┌────────────────────────────┐
│  Layer 3: Convex         │          │  Layer 4: Cloudflare R2    │
│                          │          │                            │
│  Stores per-file records:│          │  Stores raw file bytes.    │
│  {                       │          │                            │
│    tenantId: "my-sandbox"│          │  Key: "my-sandbox/hello    │
│    path: "/hello.txt"    │          │        .txt::v1"           │
│    name: "hello.txt"     │          │  Value: <binary content>   │
│    type: "file"          │          │                            │
│    size: 11              │          │                            │
│    mtime: 1706000000000  │          │                            │
│    objectKey: "my-sandbox│          │                            │
│      /hello.txt::v1"     │          │                            │
│    status: "ready"       │          │                            │
│  }                       │          │                            │
└──────────────────────────┘          └────────────────────────────┘
```

---

## What Happens When You Read a File

Say you run `cat /mnt/sandbox/notes.txt` inside a Docker container.

```
 Docker Container                 WebDAV Server                Convex           R2
 ────────────────                 ─────────────                ──────           ──
       │                                │                        │               │
  1.   │  cat /mnt/sandbox/notes.txt    │                        │               │
       │  ─────────────────────────►    │                        │               │
       │  (davfs2 intercepts this       │                        │               │
       │   and sends HTTP request)      │                        │               │
       │                                │                        │               │
  2.   │  GET /my-sandbox/notes.txt     │                        │               │
       │  ════════════════════════►     │                        │               │
       │                                │                        │               │
  3.   │                                │  query: statPath       │               │
       │                                │  { tenantId:           │               │
       │                                │    "my-sandbox",       │               │
       │                                │    path: "/notes.txt"} │               │
       │                                │  ═════════════════►    │               │
       │                                │                        │               │
  4.   │                                │  ◄═════════════════    │               │
       │                                │  { objectKey:          │               │
       │                                │    "my-sandbox/        │               │
       │                                │     notes.txt::v1",    │               │
       │                                │    size: 42, ... }     │               │
       │                                │                        │               │
  5.   │                                │  GetObject             │               │
       │                                │  key: "my-sandbox/     │               │
       │                                │   notes.txt::v1"       │               │
       │                                │  ════════════════════════════════►     │
       │                                │                        │               │
  6.   │                                │  ◄════════════════════════════════     │
       │                                │  <binary bytes>        │               │
       │                                │                        │               │
  7.   │  ◄════════════════════════     │                        │               │
       │  HTTP 200                      │                        │               │
       │  Content-Length: 42            │                        │               │
       │  Body: <file bytes>            │                        │               │
       │                                │                        │               │
  8.   │  "hello world..."             │                        │               │
       │  (printed to terminal)         │                        │               │
```

**Step by step:**

1. You run `cat notes.txt`. The OS asks the mounted filesystem for the file.
2. `davfs2` sends `GET /my-sandbox/notes.txt` to the WebDAV server.
3. The server looks up the file's metadata in Convex (does it exist? is it a
   file or directory? what's the R2 key?).
4. Convex returns the metadata record, including the `objectKey` pointing to R2.
5. The server sends a `GetObject` request to R2 using that key.
6. R2 returns the raw bytes.
7. The server streams those bytes back as an HTTP response.
8. `davfs2` gives the bytes to `cat`, which prints them.

---

## What Happens When You Write a File

Writing is a two-phase process to prevent corruption. Say you run
`echo "new content" > /mnt/sandbox/doc.txt`.

```
 Docker Container                 WebDAV Server                Convex           R2
 ────────────────                 ─────────────                ──────           ──
       │                                │                        │               │
  1.   │  echo "new content" > doc.txt  │                        │               │
       │  ─────────────────────────►    │                        │               │
       │                                │                        │               │
  2.   │  PUT /my-sandbox/doc.txt       │                        │               │
       │  Body: "new content"           │                        │               │
       │  ════════════════════════►     │                        │               │
       │                                │                        │               │
       │         ┌──────────────────────┴──── Phase 1: Reserve ──┐               │
       │         │                                               │               │
  3.   │         │  mutation: beginWrite                         │               │
       │         │  { tenantId: "my-sandbox",                    │               │
       │         │    path: "/doc.txt",                          │               │
       │         │    size: 11 }                                 │               │
       │         │  ═════════════════════════════════════════►   │               │
       │         │                                               │               │
  4.   │         │  ◄═════════════════════════════════════════   │               │
       │         │  { id: "abc123",                              │               │
       │         │    objectKey: "my-sandbox/doc.txt::v1" }      │               │
       │         │                                               │               │
       │         │  (Convex now has a record                     │               │
       │         │   with status: "pending")                     │               │
       │         └───────────────────────────────────────────────┘               │
       │                                │                                        │
       │         ┌──────────────────────┴──── Phase 2: Upload ──────────────┐    │
       │         │                                                          │    │
  5.   │         │  PutObject                                               │    │
       │         │  key: "my-sandbox/doc.txt::v1"                           │    │
       │         │  body: "new content"                                     │    │
       │         │  ════════════════════════════════════════════════════►    │    │
       │         │                                                          │    │
  6.   │         │  ◄════════════════════════════════════════════════════    │    │
       │         │  OK                                                      │    │
       │         └──────────────────────────────────────────────────────────┘    │
       │                                │                                        │
       │         ┌──────────────────────┴──── Phase 3: Commit ──┐                │
       │         │                                               │               │
  7.   │         │  mutation: commitWrite                        │               │
       │         │  { id: "abc123", size: 11 }                   │               │
       │         │  ═════════════════════════════════════════►   │               │
       │         │                                               │               │
  8.   │         │  (status flipped from "pending" to "ready")   │               │
       │         │  ◄═════════════════════════════════════════   │               │
       │         └───────────────────────────────────────────────┘               │
       │                                │                                        │
  9.   │  ◄════════════════════════     │                                        │
       │  HTTP 201 Created              │                                        │
```

**Why two phases?**

If the upload to R2 fails halfway through (network error, server crash, etc),
the Convex record still says `status: "pending"`. No other operation will see
it. The old version of the file (if any) remains intact. Only after R2
confirms the upload does the server flip the status to `"ready"`, making the
new version visible.

If the file already existed, the old version is marked `status: "deleted"`
during the `beginWrite` step, and the version number is incremented (v1 -> v2).
This means R2 keeps both copies under different keys, and you could recover old
versions in theory.

---

## Sandboxes and Isolation

A **sandbox** is a named, isolated filesystem. Each sandbox has:

- A human-readable **name** (e.g. "My Project")
- A URL-safe **slug** (e.g. `my-project`) used in all API paths

Sandboxes are stored in the `sandboxes` table in Convex. Files are scoped to
a sandbox through the `tenantId` field — a file with `tenantId: "my-project"`
is only visible to the `my-project` sandbox.

```
 Sandbox "alpha"                    Sandbox "beta"
 ───────────────                    ──────────────
 /                                  /
 ├── readme.txt                     ├── readme.txt      (different file!)
 ├── src/                           └── data/
 │   └── main.py                        └── input.csv
 └── tests/
     └── test_main.py

 These two filesystems are completely separate.
 A file created in "alpha" is invisible to "beta".
```

### URL routing

The WebDAV server uses the first path segment as the sandbox ID:

```
http://localhost:1900/{sandboxId}/{filePath}

Examples:
  GET    /alpha/readme.txt          → read alpha's readme.txt
  PUT    /beta/data/input.csv       → write to beta's data/input.csv
  DELETE /alpha/tests/test_main.py  → delete from alpha
```

The router:
1. Extracts the sandbox ID from the URL
2. Checks that the sandbox exists in Convex
3. Strips the prefix and passes the remaining path to the handler

If no sandbox ID is provided, the server returns `400`. If the sandbox
doesn't exist, it returns `404`.

---

## Project Structure

```
convex-sandbox/
│
├── convex/                      # Convex backend (runs in the cloud)
│   ├── schema.ts                #   Database schema: files + sandboxes tables
│   ├── files.ts                 #   File CRUD: statPath, listDir, beginWrite,
│   │                            #     commitWrite, movePath, deletePath, ensureDir
│   └── sandboxes.ts             #   Sandbox CRUD: list, getBySlug, create, remove
│
├── server/                      # WebDAV server (runs locally, port 1900)
│   ├── index.ts                 #   HTTP server entry point
│   ├── router.ts                #   URL parsing, sandbox validation, dispatch
│   ├── handlers/                #   One file per WebDAV method:
│   │   ├── options.ts           #     OPTIONS  → advertise capabilities
│   │   ├── propfind.ts          #     PROPFIND → list directory contents
│   │   ├── get.ts               #     GET      → download file (supports ranges)
│   │   ├── head.ts              #     HEAD     → file metadata only
│   │   ├── put.ts               #     PUT      → upload file (two-phase commit)
│   │   ├── mkcol.ts             #     MKCOL    → create directory
│   │   ├── move.ts              #     MOVE     → rename / move file
│   │   └── delete.ts            #     DELETE   → soft-delete file or directory
│   └── lib/                     #   Shared utilities:
│       ├── types.ts             #     TypeScript interfaces (FileMeta, DavHandler)
│       ├── convex-client.ts     #     Convex HTTP client
│       ├── r2-client.ts         #     Cloudflare R2 (S3) client
│       ├── paths.ts             #     Path normalization helpers
│       ├── range.ts             #     HTTP Range header parsing
│       └── xml.ts               #     XML generation for PROPFIND responses
│
├── src/                         # Next.js frontend (runs locally, port 3000)
│   └── app/
│       ├── page.tsx             #   Sandbox management UI
│       ├── layout.tsx           #   Root layout with Convex provider
│       └── ConvexClientProvider.tsx
│
├── scripts/
│   └── sandbox-shell.sh         # Launch a Docker container with a mounted sandbox
│
├── test/
│   ├── docker-compose.yml       # Docker test environment
│   └── run-tests.sh             # 13 integration tests using curl
│
└── package.json                 # Scripts: dev, server:dev, sandbox:shell, test:docker
```

---

## Setup

### Prerequisites

- Node.js 20+
- pnpm
- Docker
- A [Convex](https://www.convex.dev/) account (free tier works)
- A [Cloudflare](https://www.cloudflare.com/) account with an R2 bucket

### 1. Install dependencies

```bash
pnpm install
```

### 2. Configure Convex

```bash
npx convex dev --once
```

This creates your Convex project (if new) and deploys the schema and functions.
It also generates a `.env.local` file with your `NEXT_PUBLIC_CONVEX_URL`.

### 3. Configure R2

Add your Cloudflare R2 credentials to `.env.local`:

```
NEXT_PUBLIC_CONVEX_URL=https://your-project.convex.cloud
R2_ACCOUNT_ID=your-cloudflare-account-id
R2_ACCESS_KEY_ID=your-r2-access-key
R2_SECRET_ACCESS_KEY=your-r2-secret-key
R2_BUCKET=webdav
```

### 4. Start both servers

```bash
# Terminal 1 — frontend (localhost:3000)
pnpm dev

# Terminal 2 — WebDAV server (localhost:1900)
pnpm server:dev
```

---

## Usage

### Create a sandbox

Open http://localhost:3000, type a name, and click **Create**.

Or use the Convex CLI:

```bash
npx convex run sandboxes:create '{"name":"My Sandbox","slug":"my-sandbox"}'
```

### Mount a sandbox in Docker

```bash
pnpm sandbox:shell my-sandbox
```

This launches a Debian container, installs `davfs2`, mounts the sandbox at
`/mnt/sandbox`, and drops you into a shell. You can now use the filesystem
normally:

```bash
ls                        # list files
echo "hello" > hello.txt  # create a file
mkdir src                 # create a directory
cat hello.txt             # read a file
mv hello.txt src/         # move a file
rm src/hello.txt          # delete a file
```

### Use curl directly

```bash
# Upload a file
curl -X PUT -d "file contents" http://localhost:1900/my-sandbox/readme.txt

# Download a file
curl http://localhost:1900/my-sandbox/readme.txt

# List files
curl -X PROPFIND -H "Depth: 1" http://localhost:1900/my-sandbox/

# Create a directory
curl -X MKCOL http://localhost:1900/my-sandbox/docs

# Move a file
curl -X MOVE -H "Destination: http://localhost:1900/my-sandbox/docs/readme.txt" \
  http://localhost:1900/my-sandbox/readme.txt

# Delete a file
curl -X DELETE http://localhost:1900/my-sandbox/docs/readme.txt
```

### Delete a sandbox

Click **Delete** on the sandbox card in the web UI, then **Confirm**. This
soft-deletes all files in the sandbox and removes the sandbox record.

---

## Running Tests

The test suite requires a `test-sandbox` sandbox to exist:

```bash
npx convex run sandboxes:create '{"name":"Test Sandbox","slug":"test-sandbox"}'
```

Then run the 13 integration tests:

```bash
pnpm test:docker
```

This starts a Docker container that runs curl commands against the WebDAV
server, testing every operation: OPTIONS, PROPFIND, PUT, GET, HEAD, Range GET,
MKCOL, MOVE, DELETE, and cleanup verification.
