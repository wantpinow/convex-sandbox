/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { expect, test, describe } from "vitest";
import { api } from "./_generated/api";
import { Id } from "./_generated/dataModel";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

/** Helper: create a sandbox + session, returning both IDs. */
async function setupSession(
  t: ReturnType<typeof convexTest>,
  cwd = "/home/user"
) {
  const sandboxId = await t.mutation(api.sandbox.create, {
    name: "test-sandbox",
  });
  const sessionId = await t.mutation(api.session.create, {
    sandboxId,
    cwd,
  });
  return { sandboxId, sessionId };
}

/** Helper: store a file in the sandbox (in DB + storage). */
async function seedFile(
  t: ReturnType<typeof convexTest>,
  sandboxId: Id<"sandboxes">,
  path: string,
  content: string
) {
  const storageId: Id<"_storage"> = await t.run(async (ctx) => {
    const blob = new Blob([content], { type: "text/plain" });
    return await ctx.storage.store(blob);
  });
  const fileId = await t.mutation(api.file.create, {
    sandboxId,
    path,
    storageId,
  });
  return { fileId, storageId };
}

// ---------------------------------------------------------------------------
// Error handling
// ---------------------------------------------------------------------------
describe("exec — error handling", () => {
  test("throws when session does not exist", async () => {
    const t = convexTest(schema, modules);
    const { sessionId } = await setupSession(t);
    await t.mutation(api.session.remove, { id: sessionId });

    await expect(
      t.action(api.exec.exec, { sessionId, command: "echo hi" })
    ).rejects.toThrow("Session not found");
  });

  test("throws when sandbox is deleted (cascading delete removes session)", async () => {
    const t = convexTest(schema, modules);
    const { sandboxId, sessionId } = await setupSession(t);
    // Cascading delete removes sandbox, sessions, and files
    await t.mutation(api.sandbox.remove, { id: sandboxId });

    await expect(
      t.action(api.exec.exec, { sessionId, command: "echo hi" })
    ).rejects.toThrow("Session not found");
  });
});

// ---------------------------------------------------------------------------
// Basic execution
// ---------------------------------------------------------------------------
describe("exec — basic execution", () => {
  test("echo returns stdout, empty stderr, exit code 0", async () => {
    const t = convexTest(schema, modules);
    const { sessionId } = await setupSession(t);

    const result = await t.action(api.exec.exec, {
      sessionId,
      command: "echo hello",
    });

    expect(result.stdout).toContain("hello");
    expect(result.stderr).toBe("");
    expect(result.exitCode).toBe(0);
  });

  test("failing command returns non-zero exit code", async () => {
    const t = convexTest(schema, modules);
    const { sessionId } = await setupSession(t);

    const result = await t.action(api.exec.exec, {
      sessionId,
      command: "exit 42",
    });

    expect(result.exitCode).toBe(42);
  });

  test("stderr is captured separately from stdout", async () => {
    const t = convexTest(schema, modules);
    const { sessionId } = await setupSession(t);

    const result = await t.action(api.exec.exec, {
      sessionId,
      command: 'echo out-msg && echo err-msg >&2',
    });

    expect(result.stdout).toContain("out-msg");
    expect(result.stderr).toContain("err-msg");
    expect(result.stdout).not.toContain("err-msg");
  });

  test("empty command returns exit code 0", async () => {
    const t = convexTest(schema, modules);
    const { sessionId } = await setupSession(t);

    const result = await t.action(api.exec.exec, {
      sessionId,
      command: "",
    });

    expect(result.exitCode).toBe(0);
  });

  test("multi-line commands execute sequentially", async () => {
    const t = convexTest(schema, modules);
    const { sessionId } = await setupSession(t);

    const result = await t.action(api.exec.exec, {
      sessionId,
      command: 'A=hello\necho $A world',
    });

    expect(result.stdout).toContain("hello world");
  });

  test("CWD marker is not visible in stdout", async () => {
    const t = convexTest(schema, modules);
    const { sessionId } = await setupSession(t);

    const result = await t.action(api.exec.exec, {
      sessionId,
      command: "echo test-output",
    });

    expect(result.stdout).not.toContain("__CWD__");
  });
});

// ---------------------------------------------------------------------------
// CWD tracking
// ---------------------------------------------------------------------------
describe("exec — CWD tracking", () => {
  test("cd updates session cwd in the database", async () => {
    const t = convexTest(schema, modules);
    const { sessionId } = await setupSession(t, "/home/user");

    await t.action(api.exec.exec, {
      sessionId,
      command: "mkdir -p /tmp && cd /tmp",
    });

    const session = await t.query(api.session.get, { id: sessionId });
    expect(session!.cwd).toBe("/tmp");
  });

  test("cwd persists across sequential exec calls", async () => {
    const t = convexTest(schema, modules);
    const { sessionId } = await setupSession(t, "/home/user");

    // First call: create directory and change into it
    await t.action(api.exec.exec, {
      sessionId,
      command: "mkdir -p /workdir && cd /workdir",
    });

    // Second call: pwd should reflect the change
    const result = await t.action(api.exec.exec, {
      sessionId,
      command: "pwd",
    });

    expect(result.stdout).toContain("/workdir");
  });

  test("cwd does not update when command does not change directory", async () => {
    const t = convexTest(schema, modules);
    const { sessionId } = await setupSession(t, "/home/user");

    await t.action(api.exec.exec, {
      sessionId,
      command: "echo stay-put",
    });

    const session = await t.query(api.session.get, { id: sessionId });
    expect(session!.cwd).toBe("/home/user");
  });

  test("nested cd resolves correctly", async () => {
    const t = convexTest(schema, modules);
    const { sessionId } = await setupSession(t, "/");

    await t.action(api.exec.exec, {
      sessionId,
      command: "mkdir -p /a/b/c && cd /a/b/c",
    });

    const session = await t.query(api.session.get, { id: sessionId });
    expect(session!.cwd).toBe("/a/b/c");
  });
});

// ---------------------------------------------------------------------------
// File creation via commands
// ---------------------------------------------------------------------------
describe("exec — file creation", () => {
  test("writing a file creates an entry in the DB", async () => {
    const t = convexTest(schema, modules);
    const { sandboxId, sessionId } = await setupSession(t);

    await t.action(api.exec.exec, {
      sessionId,
      command: 'echo "hello world" > /home/user/test.txt',
    });

    const files = await t.query(api.file.listBySandbox, { sandboxId });
    expect(files).toHaveLength(1);
    expect(files[0].path).toBe("/home/user/test.txt");
  });

  test("created file content is persisted in storage", async () => {
    const t = convexTest(schema, modules);
    const { sandboxId, sessionId } = await setupSession(t);

    await t.action(api.exec.exec, {
      sessionId,
      command: 'echo "stored content" > /home/user/output.txt',
    });

    const files = await t.query(api.file.listBySandbox, { sandboxId });
    const content = await t.run(async (ctx) => {
      const blob = await ctx.storage.get(files[0].storageId);
      return blob ? await blob.text() : null;
    });
    expect(content).toContain("stored content");
  });

  test("creating multiple files in one command persists all of them", async () => {
    const t = convexTest(schema, modules);
    const { sandboxId, sessionId } = await setupSession(t);

    await t.action(api.exec.exec, {
      sessionId,
      command:
        'echo "a" > /home/user/a.txt && echo "b" > /home/user/b.txt && echo "c" > /home/user/c.txt',
    });

    const files = await t.query(api.file.listBySandbox, { sandboxId });
    expect(files).toHaveLength(3);
    const paths = files.map((f) => f.path).sort();
    expect(paths).toEqual([
      "/home/user/a.txt",
      "/home/user/b.txt",
      "/home/user/c.txt",
    ]);
  });
});

// ---------------------------------------------------------------------------
// File modification
// ---------------------------------------------------------------------------
describe("exec — file modification", () => {
  test("overwriting an existing file updates the DB entry (not a new one)", async () => {
    const t = convexTest(schema, modules);
    const { sandboxId, sessionId } = await setupSession(t);
    await seedFile(t, sandboxId, "/home/user/existing.txt", "original");

    await t.action(api.exec.exec, {
      sessionId,
      command: 'echo "modified" > /home/user/existing.txt',
    });

    const files = await t.query(api.file.listBySandbox, { sandboxId });
    expect(files).toHaveLength(1);

    const content = await t.run(async (ctx) => {
      const blob = await ctx.storage.get(files[0].storageId);
      return blob ? await blob.text() : null;
    });
    expect(content).toContain("modified");
  });

  test("appending to a file updates it", async () => {
    const t = convexTest(schema, modules);
    const { sandboxId, sessionId } = await setupSession(t);
    await seedFile(t, sandboxId, "/home/user/log.txt", "line1\n");

    await t.action(api.exec.exec, {
      sessionId,
      command: 'echo "line2" >> /home/user/log.txt',
    });

    const files = await t.query(api.file.listBySandbox, { sandboxId });
    expect(files).toHaveLength(1);

    const content = await t.run(async (ctx) => {
      const blob = await ctx.storage.get(files[0].storageId);
      return blob ? await blob.text() : null;
    });
    expect(content).toContain("line1");
    expect(content).toContain("line2");
  });
});

// ---------------------------------------------------------------------------
// File deletion
// ---------------------------------------------------------------------------
describe("exec — file deletion", () => {
  test("rm removes the file entry from DB", async () => {
    const t = convexTest(schema, modules);
    const { sandboxId, sessionId } = await setupSession(t);
    await seedFile(t, sandboxId, "/home/user/doomed.txt", "bye");

    await t.action(api.exec.exec, {
      sessionId,
      command: "rm /home/user/doomed.txt",
    });

    const files = await t.query(api.file.listBySandbox, { sandboxId });
    expect(files).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// File move
// ---------------------------------------------------------------------------
describe("exec — file move", () => {
  test("mv removes source entry and creates dest entry", async () => {
    const t = convexTest(schema, modules);
    const { sandboxId, sessionId } = await setupSession(t);
    await seedFile(t, sandboxId, "/home/user/src.txt", "content");

    await t.action(api.exec.exec, {
      sessionId,
      command: "mv /home/user/src.txt /home/user/dest.txt",
    });

    const files = await t.query(api.file.listBySandbox, { sandboxId });
    const paths = files.map((f) => f.path);
    expect(paths).not.toContain("/home/user/src.txt");
    expect(paths).toContain("/home/user/dest.txt");
  });

  test("mv preserves file content", async () => {
    const t = convexTest(schema, modules);
    const { sandboxId, sessionId } = await setupSession(t);
    await seedFile(t, sandboxId, "/home/user/orig.txt", "keep me");

    await t.action(api.exec.exec, {
      sessionId,
      command: "mv /home/user/orig.txt /home/user/moved.txt",
    });

    const files = await t.query(api.file.listBySandbox, { sandboxId });
    const movedFile = files.find((f) => f.path === "/home/user/moved.txt");
    expect(movedFile).toBeDefined();

    const content = await t.run(async (ctx) => {
      const blob = await ctx.storage.get(movedFile!.storageId);
      return blob ? await blob.text() : null;
    });
    expect(content).toContain("keep me");
  });
});

// ---------------------------------------------------------------------------
// File copy
// ---------------------------------------------------------------------------
describe("exec — file copy", () => {
  test("cp creates dest entry while source remains", async () => {
    const t = convexTest(schema, modules);
    const { sandboxId, sessionId } = await setupSession(t);
    await seedFile(t, sandboxId, "/home/user/original.txt", "copy me");

    await t.action(api.exec.exec, {
      sessionId,
      command: "cp /home/user/original.txt /home/user/copy.txt",
    });

    const files = await t.query(api.file.listBySandbox, { sandboxId });
    const paths = files.map((f) => f.path);
    expect(paths).toContain("/home/user/original.txt");
    expect(paths).toContain("/home/user/copy.txt");
  });

  test("cp copy has the same content as original", async () => {
    const t = convexTest(schema, modules);
    const { sandboxId, sessionId } = await setupSession(t);
    await seedFile(t, sandboxId, "/home/user/source.txt", "clone this");

    await t.action(api.exec.exec, {
      sessionId,
      command: "cp /home/user/source.txt /home/user/clone.txt",
    });

    const files = await t.query(api.file.listBySandbox, { sandboxId });
    const clone = files.find((f) => f.path === "/home/user/clone.txt");
    expect(clone).toBeDefined();

    const content = await t.run(async (ctx) => {
      const blob = await ctx.storage.get(clone!.storageId);
      return blob ? await blob.text() : null;
    });
    expect(content).toContain("clone this");
  });
});

// ---------------------------------------------------------------------------
// Pre-existing files (lazy loading from storage)
// ---------------------------------------------------------------------------
describe("exec — pre-existing files", () => {
  test("can read a seeded file from within bash", async () => {
    const t = convexTest(schema, modules);
    const { sandboxId, sessionId } = await setupSession(t);
    await seedFile(t, sandboxId, "/home/user/readme.txt", "hello from storage");

    const result = await t.action(api.exec.exec, {
      sessionId,
      command: "cat /home/user/readme.txt",
    });

    expect(result.stdout).toContain("hello from storage");
  });

  test("can modify a seeded file and read it back", async () => {
    const t = convexTest(schema, modules);
    const { sandboxId, sessionId } = await setupSession(t);
    await seedFile(t, sandboxId, "/home/user/data.txt", "v1");

    // Modify in one exec call
    await t.action(api.exec.exec, {
      sessionId,
      command: 'echo "v2" > /home/user/data.txt',
    });

    // Read back in another exec call
    const result = await t.action(api.exec.exec, {
      sessionId,
      command: "cat /home/user/data.txt",
    });

    expect(result.stdout).toContain("v2");
  });
});

// ---------------------------------------------------------------------------
// Storage verification
// ---------------------------------------------------------------------------
describe("exec — storage verification", () => {
  test("writing a file creates a real blob in storage", async () => {
    const t = convexTest(schema, modules);
    const { sandboxId, sessionId } = await setupSession(t);

    await t.action(api.exec.exec, {
      sessionId,
      command: 'echo "blob check" > /home/user/blob.txt',
    });

    const files = await t.query(api.file.listBySandbox, { sandboxId });
    expect(files).toHaveLength(1);

    // Verify the storageId points to a real blob with correct content
    const content = await t.run(async (ctx) => {
      const blob = await ctx.storage.get(files[0].storageId);
      if (!blob) return null;
      return await blob.text();
    });
    expect(content).not.toBeNull();
    expect(content).toContain("blob check");
  });

  test("writing a file creates an entry in the _storage system table", async () => {
    const t = convexTest(schema, modules);
    const { sandboxId, sessionId } = await setupSession(t);

    await t.action(api.exec.exec, {
      sessionId,
      command: 'echo "sys table" > /home/user/sys.txt',
    });

    const files = await t.query(api.file.listBySandbox, { sandboxId });
    const metadata = await t.run(async (ctx) => {
      return await ctx.db.system.get(files[0].storageId);
    });
    expect(metadata).not.toBeNull();
    expect(metadata!.size).toBeGreaterThan(0);
  });

  test("each new file gets its own unique storageId", async () => {
    const t = convexTest(schema, modules);
    const { sandboxId, sessionId } = await setupSession(t);

    await t.action(api.exec.exec, {
      sessionId,
      command:
        'echo "aaa" > /home/user/a.txt && echo "bbb" > /home/user/b.txt',
    });

    const files = await t.query(api.file.listBySandbox, { sandboxId });
    expect(files).toHaveLength(2);
    expect(files[0].storageId).not.toBe(files[1].storageId);
  });

  test("overwriting a file produces a new storageId (old blob is not reused)", async () => {
    const t = convexTest(schema, modules);
    const { sandboxId, sessionId } = await setupSession(t);
    const { storageId: originalStorageId } = await seedFile(
      t,
      sandboxId,
      "/home/user/evolve.txt",
      "v1"
    );

    await t.action(api.exec.exec, {
      sessionId,
      command: 'echo "v2" > /home/user/evolve.txt',
    });

    const files = await t.query(api.file.listBySandbox, { sandboxId });
    expect(files).toHaveLength(1);
    // New storageId should differ from the original seed
    expect(files[0].storageId).not.toBe(originalStorageId);

    // New blob has new content
    const newContent = await t.run(async (ctx) => {
      const blob = await ctx.storage.get(files[0].storageId);
      return blob ? await blob.text() : null;
    });
    expect(newContent).toContain("v2");
  });

  test("old blob still exists in storage after overwrite (storage is append-only)", async () => {
    const t = convexTest(schema, modules);
    const { sandboxId, sessionId } = await setupSession(t);
    const { storageId: originalStorageId } = await seedFile(
      t,
      sandboxId,
      "/home/user/keep-old.txt",
      "original content"
    );

    await t.action(api.exec.exec, {
      sessionId,
      command: 'echo "new content" > /home/user/keep-old.txt',
    });

    // The old blob should still be retrievable (exec doesn't delete old blobs)
    const oldContent = await t.run(async (ctx) => {
      const blob = await ctx.storage.get(originalStorageId);
      if (!blob) return null;
      return await blob.text();
    });
    expect(oldContent).not.toBeNull();
    expect(oldContent).toContain("original content");
  });

  test("deleting a file removes DB entry but blob remains in storage", async () => {
    const t = convexTest(schema, modules);
    const { sandboxId, sessionId } = await setupSession(t);
    const { storageId } = await seedFile(
      t,
      sandboxId,
      "/home/user/orphan-blob.txt",
      "I will be orphaned"
    );

    await t.action(api.exec.exec, {
      sessionId,
      command: "rm /home/user/orphan-blob.txt",
    });

    // DB entry is gone
    const files = await t.query(api.file.listBySandbox, { sandboxId });
    expect(files).toHaveLength(0);

    // But the blob is still in storage (exec only calls file.remove, not storage.delete)
    const orphanedContent = await t.run(async (ctx) => {
      const blob = await ctx.storage.get(storageId);
      if (!blob) return null;
      return await blob.text();
    });
    expect(orphanedContent).not.toBeNull();
    expect(orphanedContent).toContain("I will be orphaned");
  });

  test("appending to a file creates a new blob (not in-place mutation)", async () => {
    const t = convexTest(schema, modules);
    const { sandboxId, sessionId } = await setupSession(t);
    const { storageId: originalStorageId } = await seedFile(
      t,
      sandboxId,
      "/home/user/append-target.txt",
      "line1\n"
    );

    await t.action(api.exec.exec, {
      sessionId,
      command: 'echo "line2" >> /home/user/append-target.txt',
    });

    const files = await t.query(api.file.listBySandbox, { sandboxId });
    expect(files).toHaveLength(1);

    // Append produces a new storageId
    expect(files[0].storageId).not.toBe(originalStorageId);

    // New blob has both lines
    const content = await t.run(async (ctx) => {
      const blob = await ctx.storage.get(files[0].storageId);
      return blob ? await blob.text() : null;
    });
    expect(content).toContain("line1");
    expect(content).toContain("line2");

    // Old blob still has only original content
    const oldContent = await t.run(async (ctx) => {
      const blob = await ctx.storage.get(originalStorageId);
      return blob ? await blob.text() : null;
    });
    expect(oldContent).toBe("line1\n");
    expect(oldContent).not.toContain("line2");
  });

  test("mv creates a new blob for dest (content round-trips through storage)", async () => {
    const t = convexTest(schema, modules);
    const { sandboxId, sessionId } = await setupSession(t);
    await seedFile(t, sandboxId, "/home/user/mv-src.txt", "move me to storage");

    await t.action(api.exec.exec, {
      sessionId,
      command: "mv /home/user/mv-src.txt /home/user/mv-dest.txt",
    });

    const files = await t.query(api.file.listBySandbox, { sandboxId });
    const dest = files.find((f) => f.path === "/home/user/mv-dest.txt");
    expect(dest).toBeDefined();

    // Dest blob exists and has correct content
    const destContent = await t.run(async (ctx) => {
      const blob = await ctx.storage.get(dest!.storageId);
      if (!blob) return null;
      return await blob.text();
    });
    expect(destContent).not.toBeNull();
    expect(destContent).toContain("move me to storage");
  });

  test("cp creates a separate blob for the copy", async () => {
    const t = convexTest(schema, modules);
    const { sandboxId, sessionId } = await setupSession(t);
    const { storageId: srcStorageId } = await seedFile(
      t,
      sandboxId,
      "/home/user/cp-src.txt",
      "copy me"
    );

    await t.action(api.exec.exec, {
      sessionId,
      command: "cp /home/user/cp-src.txt /home/user/cp-dest.txt",
    });

    const files = await t.query(api.file.listBySandbox, { sandboxId });
    const src = files.find((f) => f.path === "/home/user/cp-src.txt");
    const dest = files.find((f) => f.path === "/home/user/cp-dest.txt");
    expect(src).toBeDefined();
    expect(dest).toBeDefined();

    // Copy gets its own blob, distinct from the original seed blob
    // (exec reads from bash fs and stores a new blob)
    expect(dest!.storageId).not.toBe(srcStorageId);

    // Both blobs have the same content
    const srcContent = await t.run(async (ctx) => {
      const blob = await ctx.storage.get(src!.storageId);
      return blob ? await blob.text() : null;
    });
    const destContent = await t.run(async (ctx) => {
      const blob = await ctx.storage.get(dest!.storageId);
      return blob ? await blob.text() : null;
    });
    expect(destContent).toContain("copy me");
    expect(srcContent).toContain("copy me");
  });
});

// ---------------------------------------------------------------------------
// Edge cases: write-then-delete, delete-then-write
// ---------------------------------------------------------------------------
describe("exec — edge cases", () => {
  test("write-then-delete in same command: file is NOT persisted", async () => {
    const t = convexTest(schema, modules);
    const { sandboxId, sessionId } = await setupSession(t);

    await t.action(api.exec.exec, {
      sessionId,
      command:
        'echo "temp" > /home/user/temp.txt && rm /home/user/temp.txt',
    });

    const files = await t.query(api.file.listBySandbox, { sandboxId });
    expect(files).toHaveLength(0);
  });

  test("delete-then-write in same command: file IS persisted", async () => {
    const t = convexTest(schema, modules);
    const { sandboxId, sessionId } = await setupSession(t);
    await seedFile(t, sandboxId, "/home/user/reborn.txt", "old");

    await t.action(api.exec.exec, {
      sessionId,
      command:
        'rm /home/user/reborn.txt && echo "new" > /home/user/reborn.txt',
    });

    const files = await t.query(api.file.listBySandbox, { sandboxId });
    const reborn = files.find((f) => f.path === "/home/user/reborn.txt");
    expect(reborn).toBeDefined();

    const content = await t.run(async (ctx) => {
      const blob = await ctx.storage.get(reborn!.storageId);
      return blob ? await blob.text() : null;
    });
    expect(content).toContain("new");
  });

  test("multiple operations on same file: final state wins", async () => {
    const t = convexTest(schema, modules);
    const { sandboxId, sessionId } = await setupSession(t);

    await t.action(api.exec.exec, {
      sessionId,
      command:
        'echo "first" > /home/user/multi.txt && echo "second" > /home/user/multi.txt && echo "third" > /home/user/multi.txt',
    });

    const files = await t.query(api.file.listBySandbox, { sandboxId });
    expect(files).toHaveLength(1);

    const content = await t.run(async (ctx) => {
      const blob = await ctx.storage.get(files[0].storageId);
      return blob ? await blob.text() : null;
    });
    expect(content).toContain("third");
  });

  test("command with pipes works", async () => {
    const t = convexTest(schema, modules);
    const { sessionId } = await setupSession(t);

    const result = await t.action(api.exec.exec, {
      sessionId,
      command: 'echo "hello world" | tr " " "\\n" | sort',
    });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("hello");
    expect(result.stdout).toContain("world");
  });

  test("environment variables work within a command", async () => {
    const t = convexTest(schema, modules);
    const { sessionId } = await setupSession(t);

    const result = await t.action(api.exec.exec, {
      sessionId,
      command: 'MY_VAR="testing123" && echo $MY_VAR',
    });

    expect(result.stdout).toContain("testing123");
  });

  test("file written in one session is readable in a different session of same sandbox", async () => {
    const t = convexTest(schema, modules);
    const sandboxId = await t.mutation(api.sandbox.create, {
      name: "shared-sandbox",
    });
    const session1 = await t.mutation(api.session.create, {
      sandboxId,
      cwd: "/home/user",
    });
    const session2 = await t.mutation(api.session.create, {
      sandboxId,
      cwd: "/home/user",
    });

    // Write in session 1
    await t.action(api.exec.exec, {
      sessionId: session1,
      command: 'echo "cross-session" > /home/user/shared.txt',
    });

    // Read in session 2
    const result = await t.action(api.exec.exec, {
      sessionId: session2,
      command: "cat /home/user/shared.txt",
    });

    expect(result.stdout).toContain("cross-session");
  });

  test("files from different sandboxes are isolated", async () => {
    const t = convexTest(schema, modules);

    const sandbox1 = await t.mutation(api.sandbox.create, {
      name: "sandbox-1",
    });
    const sandbox2 = await t.mutation(api.sandbox.create, {
      name: "sandbox-2",
    });
    const session1 = await t.mutation(api.session.create, {
      sandboxId: sandbox1,
      cwd: "/home/user",
    });
    const session2 = await t.mutation(api.session.create, {
      sandboxId: sandbox2,
      cwd: "/home/user",
    });

    // Write a file in sandbox 1
    await t.action(api.exec.exec, {
      sessionId: session1,
      command: 'echo "sandbox1-only" > /home/user/private.txt',
    });

    // sandbox 2 should NOT see that file
    const result = await t.action(api.exec.exec, {
      sessionId: session2,
      command: "cat /home/user/private.txt 2>&1 || true",
    });

    expect(result.stdout).not.toContain("sandbox1-only");
  });
});
