/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { expect, test, describe } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

describe("sandbox", () => {
  test("create returns a valid sandbox id", async () => {
    const t = convexTest(schema, modules);
    const id = await t.mutation(api.sandbox.create, { name: "my-sandbox" });
    expect(id).toBeDefined();
  });

  test("get retrieves a created sandbox", async () => {
    const t = convexTest(schema, modules);
    const id = await t.mutation(api.sandbox.create, { name: "my-sandbox" });
    const sandbox = await t.query(api.sandbox.get, { id });
    expect(sandbox).toMatchObject({ name: "my-sandbox" });
    expect(sandbox!._id).toBe(id);
  });

  test("get returns null for non-existent id", async () => {
    const t = convexTest(schema, modules);
    // Create and delete a sandbox to get a valid-format but non-existent id
    const id = await t.mutation(api.sandbox.create, { name: "temp" });
    await t.mutation(api.sandbox.remove, { id });
    const sandbox = await t.query(api.sandbox.get, { id });
    expect(sandbox).toBeNull();
  });

  test("list returns all sandboxes", async () => {
    const t = convexTest(schema, modules);
    await t.mutation(api.sandbox.create, { name: "sandbox-1" });
    await t.mutation(api.sandbox.create, { name: "sandbox-2" });
    await t.mutation(api.sandbox.create, { name: "sandbox-3" });
    const sandboxes = await t.query(api.sandbox.list);
    expect(sandboxes).toHaveLength(3);
    expect(sandboxes.map((s) => s.name)).toEqual(
      expect.arrayContaining(["sandbox-1", "sandbox-2", "sandbox-3"])
    );
  });

  test("list returns empty array when none exist", async () => {
    const t = convexTest(schema, modules);
    const sandboxes = await t.query(api.sandbox.list);
    expect(sandboxes).toEqual([]);
  });

  test("update changes the name", async () => {
    const t = convexTest(schema, modules);
    const id = await t.mutation(api.sandbox.create, { name: "old-name" });
    await t.mutation(api.sandbox.update, { id, name: "new-name" });
    const sandbox = await t.query(api.sandbox.get, { id });
    expect(sandbox!.name).toBe("new-name");
  });

  test("remove deletes the sandbox", async () => {
    const t = convexTest(schema, modules);
    const id = await t.mutation(api.sandbox.create, { name: "to-delete" });
    await t.mutation(api.sandbox.remove, { id });
    const sandbox = await t.query(api.sandbox.get, { id });
    expect(sandbox).toBeNull();
  });
});
