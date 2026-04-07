/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { expect, test, describe } from "vitest";
import { api } from "./_generated/api";
import { Id } from "./_generated/dataModel";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

/** Helper: create a sandbox and store a blob, returning both IDs. */
async function setupSandboxAndStorage(t: ReturnType<typeof convexTest>) {
  const sandboxId = await t.mutation(api.sandbox.create, {
    name: "test-sandbox",
  });
  const storageId: Id<"_storage"> = await t.run(async (ctx) => {
    const blob = new Blob(["hello world"], { type: "text/plain" });
    return await ctx.storage.store(blob);
  });
  return { sandboxId, storageId };
}

describe("file", () => {
  test("create inserts a file and returns its id", async () => {
    const t = convexTest(schema, modules);
    const { sandboxId, storageId } = await setupSandboxAndStorage(t);

    const fileId = await t.mutation(api.file.create, {
      sandboxId,
      path: "/home/user/test.txt",
      storageId,
    });
    expect(fileId).toBeDefined();

    const file = await t.query(api.file.get, { id: fileId });
    expect(file).toMatchObject({
      sandboxId,
      path: "/home/user/test.txt",
      storageId,
    });
  });

  test("create throws on duplicate path in same sandbox", async () => {
    const t = convexTest(schema, modules);
    const { sandboxId, storageId } = await setupSandboxAndStorage(t);

    await t.mutation(api.file.create, {
      sandboxId,
      path: "/home/user/test.txt",
      storageId,
    });

    await expect(
      t.mutation(api.file.create, {
        sandboxId,
        path: "/home/user/test.txt",
        storageId,
      })
    ).rejects.toThrow("Path already exists");
  });

  test("create allows same path in different sandboxes", async () => {
    const t = convexTest(schema, modules);
    const { storageId } = await setupSandboxAndStorage(t);
    const sandbox1 = await t.mutation(api.sandbox.create, {
      name: "sandbox-1",
    });
    const sandbox2 = await t.mutation(api.sandbox.create, {
      name: "sandbox-2",
    });

    const file1 = await t.mutation(api.file.create, {
      sandboxId: sandbox1,
      path: "/same/path.txt",
      storageId,
    });
    const file2 = await t.mutation(api.file.create, {
      sandboxId: sandbox2,
      path: "/same/path.txt",
      storageId,
    });
    expect(file1).toBeDefined();
    expect(file2).toBeDefined();
    expect(file1).not.toBe(file2);
  });

  test("get retrieves a created file", async () => {
    const t = convexTest(schema, modules);
    const { sandboxId, storageId } = await setupSandboxAndStorage(t);
    const fileId = await t.mutation(api.file.create, {
      sandboxId,
      path: "/test.txt",
      storageId,
    });
    const file = await t.query(api.file.get, { id: fileId });
    expect(file).not.toBeNull();
    expect(file!._id).toBe(fileId);
  });

  test("get returns null for non-existent id", async () => {
    const t = convexTest(schema, modules);
    const { sandboxId, storageId } = await setupSandboxAndStorage(t);
    const fileId = await t.mutation(api.file.create, {
      sandboxId,
      path: "/test.txt",
      storageId,
    });
    await t.mutation(api.file.remove, { id: fileId });
    const file = await t.query(api.file.get, { id: fileId });
    expect(file).toBeNull();
  });

  test("listBySandbox returns all files for a sandbox", async () => {
    const t = convexTest(schema, modules);
    const { sandboxId, storageId } = await setupSandboxAndStorage(t);

    await t.mutation(api.file.create, {
      sandboxId,
      path: "/a.txt",
      storageId,
    });
    await t.mutation(api.file.create, {
      sandboxId,
      path: "/b.txt",
      storageId,
    });
    await t.mutation(api.file.create, {
      sandboxId,
      path: "/c.txt",
      storageId,
    });

    const files = await t.query(api.file.listBySandbox, { sandboxId });
    expect(files).toHaveLength(3);
    expect(files.map((f) => f.path)).toEqual(
      expect.arrayContaining(["/a.txt", "/b.txt", "/c.txt"])
    );
  });

  test("listBySandbox returns empty for sandbox with no files", async () => {
    const t = convexTest(schema, modules);
    const sandboxId = await t.mutation(api.sandbox.create, {
      name: "empty",
    });
    const files = await t.query(api.file.listBySandbox, { sandboxId });
    expect(files).toEqual([]);
  });

  test("update changes storageId", async () => {
    const t = convexTest(schema, modules);
    const { sandboxId, storageId } = await setupSandboxAndStorage(t);
    const fileId = await t.mutation(api.file.create, {
      sandboxId,
      path: "/test.txt",
      storageId,
    });

    const newStorageId: Id<"_storage"> = await t.run(async (ctx) => {
      const blob = new Blob(["updated content"], { type: "text/plain" });
      return await ctx.storage.store(blob);
    });

    await t.mutation(api.file.update, {
      id: fileId,
      storageId: newStorageId,
    });

    const file = await t.query(api.file.get, { id: fileId });
    expect(file!.storageId).toBe(newStorageId);
  });

  test("update changes path to non-conflicting value", async () => {
    const t = convexTest(schema, modules);
    const { sandboxId, storageId } = await setupSandboxAndStorage(t);
    const fileId = await t.mutation(api.file.create, {
      sandboxId,
      path: "/old-name.txt",
      storageId,
    });

    await t.mutation(api.file.update, {
      id: fileId,
      path: "/new-name.txt",
    });

    const file = await t.query(api.file.get, { id: fileId });
    expect(file!.path).toBe("/new-name.txt");
  });

  test("update throws when renaming to an occupied path", async () => {
    const t = convexTest(schema, modules);
    const { sandboxId, storageId } = await setupSandboxAndStorage(t);

    await t.mutation(api.file.create, {
      sandboxId,
      path: "/existing.txt",
      storageId,
    });
    const fileId = await t.mutation(api.file.create, {
      sandboxId,
      path: "/other.txt",
      storageId,
    });

    await expect(
      t.mutation(api.file.update, { id: fileId, path: "/existing.txt" })
    ).rejects.toThrow("Path already exists");
  });

  test("update allows keeping the same path", async () => {
    const t = convexTest(schema, modules);
    const { sandboxId, storageId } = await setupSandboxAndStorage(t);
    const fileId = await t.mutation(api.file.create, {
      sandboxId,
      path: "/same.txt",
      storageId,
    });

    // Should not throw — path === file.path so the uniqueness check is skipped
    await t.mutation(api.file.update, {
      id: fileId,
      path: "/same.txt",
    });

    const file = await t.query(api.file.get, { id: fileId });
    expect(file!.path).toBe("/same.txt");
  });

  test("update throws when file not found", async () => {
    const t = convexTest(schema, modules);
    const { sandboxId, storageId } = await setupSandboxAndStorage(t);
    const fileId = await t.mutation(api.file.create, {
      sandboxId,
      path: "/gone.txt",
      storageId,
    });
    await t.mutation(api.file.remove, { id: fileId });

    await expect(
      t.mutation(api.file.update, { id: fileId, path: "/new.txt" })
    ).rejects.toThrow("File not found");
  });

  test("remove deletes the file", async () => {
    const t = convexTest(schema, modules);
    const { sandboxId, storageId } = await setupSandboxAndStorage(t);
    const fileId = await t.mutation(api.file.create, {
      sandboxId,
      path: "/delete-me.txt",
      storageId,
    });
    await t.mutation(api.file.remove, { id: fileId });
    const file = await t.query(api.file.get, { id: fileId });
    expect(file).toBeNull();
  });
});
