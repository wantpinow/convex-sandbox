> This repo is WIP. Do not use directly in production.

# Convex Sandbox

Persistent bash sandboxes backed by Convex, using Vercel's [`just-bash`](https://github.com/nicolo-ribaudo/just-bash) for in-memory command execution and Convex file storage for filesystem persistence. No VMs or containers involved.

https://github.com/user-attachments/assets/15027d2d-e41e-4bbb-84cc-04163ea38207

## Overview

`just-bash` provides a bash interpreter that runs in-process on Node.js with a virtual in-memory filesystem. This project wraps it in a Convex action that loads the filesystem from storage before execution and diffs changes back afterward. The result is stateful, isolated bash environments that persist across invocations using only Convex primitives (database, file storage, and actions).

An optional AI agent (`@convex-dev/agent`) provides a chat interface that can execute commands in the sandbox via tool calling.

## The execution engine

The core logic lives in `convex/exec.ts`. Here's what happens on each command:

### 1. Lazy filesystem hydration

```typescript
const initialFiles: InitialFiles = {};
for (const file of files) {
  const { storageId } = file;
  initialFiles[file.path] = async () => {
    const blob = await ctx.storage.get(storageId);
    if (!blob) return "";
    return await blob.text();
  };
}
```

Files are registered as async callbacks rather than loaded eagerly. `just-bash` only calls the callback when a command actually reads the file, so commands that touch a small number of files don't pay the cost of loading the entire filesystem.

### 2. Filesystem mutation tracking

We intercept the virtual filesystem's mutating methods (`writeFile`, `appendFile`, `rm`, `mv`, `cp`) to build a diff of what changed during execution:

```typescript
const writtenPaths = new Set<string>();
const deletedPaths = new Set<string>();

const origWriteFile = fs.writeFile.bind(fs);
fs.writeFile = async (...fsArgs) => {
  const path = fs.resolvePath(bash.getCwd(), fsArgs[0]);
  writtenPaths.add(path);
  deletedPaths.delete(path);
  return origWriteFile(...fsArgs);
};
```

The two sets interact correctly for compound operations: a file that is written then deleted in the same command won't be persisted; a file that is deleted then re-created will be.

### 3. Working directory persistence

`just-bash` resets its internal cwd after each `exec()` call, so `cd` would not persist between commands. We work around this by appending a hidden `pwd` to every command and extracting the result from stdout:

```typescript
const CWD_MARKER = "\x00__CWD__\x00";
const result = await bash.exec(
  `${command}\n__exit_code=$?\necho "${CWD_MARKER}$(pwd)"\nexit $__exit_code`
);
```

The marker is stripped from the output, and the extracted path is saved to the session for the next invocation.

### 4. Change persistence

After execution, changes are written back to Convex:

- **Written paths**: content is read from the virtual FS, stored as a blob via `ctx.storage.store()`, and the file record is created or updated.
- **Deleted paths**: the corresponding file record is removed from the database.
- **CWD changes**: the session record is patched with the new working directory.

Each file version produces a new storage blob. Previous blobs are not deleted during execution (the sandbox delete mutation handles cleanup).

## Data model

| Table | Fields | Purpose |
|-------|--------|---------|
| `sandboxes` | `name` | Top-level isolation boundary |
| `sessions` | `sandboxId`, `cwd` | Persistent working directory per terminal |
| `files` | `sandboxId`, `path`, `storageId` | Virtual filesystem entries backed by Convex storage |
| `agentThreads` | `threadId`, `sandboxId`, `sessionId` | Maps AI agent threads to sandboxes |

Indexes enforce path uniqueness per sandbox (`bySandboxIdAndPath`) and support efficient lookups by parent (`bySandboxId`).

## Architecture

```
┌─────────────────────────────────────────────────────┐
│  Next.js Frontend                                   │
│  ┌──────────┬──────────────────────┬──────────────┐ │
│  │ File     │ File Viewer          │ Agent Panel  │ │
│  │ Tree     │                      │              │ │
│  │          ├──────────────────────┤              │ │
│  │          │ Terminal             │              │ │
│  └──────────┴──────────────────────┴──────────────┘ │
└───────────────────────┬─────────────────────────────┘
                        │
┌───────────────────────┴─────────────────────────────┐
│  Convex Backend                                     │
│                                                     │
│  run.ts ──► exec.ts                                 │
│              ├─ Hydrate virtual FS from storage      │
│              ├─ Intercept FS mutations               │
│              ├─ Execute via just-bash                 │
│              ├─ Extract cwd from output               │
│              └─ Persist diff back to storage          │
│                                                     │
│  agent.ts ──► exec tool ──► run.ts                  │
└─────────────────────────────────────────────────────┘
```

## AI agent

The agent (`convex/agent.ts`) uses `@convex-dev/agent` with the Vercel AI Gateway (`anthropic/claude-sonnet-4-20250514`). It exposes a single `exec` tool that calls `run.ts`. The agent maintains a persistent session per thread so that directory changes and file modifications carry across tool calls within a conversation.

## Setup

```bash
pnpm install

# Start Convex (deploys functions and generates types)
npx convex dev

# Set the AI Gateway API key (required for the agent)
npx convex env set AI_GATEWAY_API_KEY <your-key>

# Start the frontend
pnpm dev
```

## Scripts

| Command | Description |
|---------|-------------|
| `pnpm dev` | Next.js dev server (Turbopack) |
| `pnpm dev:convex` | Convex dev server |
| `pnpm build` | Production build |
| `pnpm test:once` | Run test suite (72 tests) |
| `pnpm lint` | ESLint |
| `pnpm typecheck` | TypeScript (frontend + Convex) |

## Project structure

```
convex/
  exec.ts            Core execution engine
  run.ts             Orchestration action (creates sandbox/session if needed)
  sandbox.ts         Sandbox CRUD (cascading deletes)
  session.ts         Session CRUD
  file.ts            File CRUD with path uniqueness + content URL query
  agent.ts           AI agent definition and exec tool
  agentQueries.ts    Thread/message queries for the chat UI
  schema.ts          Database schema
  convex.config.ts   Component registration (@convex-dev/agent)
  *.test.ts          Tests

app/
  page.tsx                   Sandbox list (create, delete)
  [sandboxId]/page.tsx       IDE layout (file tree, viewer, terminal, agent)

components/
  file-tree.tsx       Nested file tree with selection state
  file-viewer.tsx     Text file display with line numbers
  terminal.tsx        Terminal with session management
  agent-panel.tsx     Chat panel with streaming and tool call rendering
```

## Dependencies

| Package | Role |
|---------|------|
| [`just-bash`](https://github.com/nicolo-ribaudo/just-bash) | In-memory bash interpreter with virtual filesystem |
| [`convex`](https://convex.dev) | Database, file storage, serverless functions |
| [`@convex-dev/agent`](https://github.com/get-convex/agent) | AI agent with tool calling |
| [`@ai-sdk/gateway`](https://sdk.vercel.ai) | Vercel AI Gateway provider |
| [`react-resizable-panels`](https://github.com/bvaughn/react-resizable-panels) | Resizable panel layout |
| [`convex-test`](https://docs.convex.dev/testing) | Convex function testing |

## License

Apache 2.0. See [LICENSE](LICENSE).
