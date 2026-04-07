/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { expect, test, describe } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

describe("session", () => {
  test("create returns a valid session id with correct fields", async () => {
    const t = convexTest(schema, modules);
    const sandboxId = await t.mutation(api.sandbox.create, {
      name: "test-sandbox",
    });
    const sessionId = await t.mutation(api.session.create, {
      sandboxId,
      cwd: "/home/user",
    });
    expect(sessionId).toBeDefined();

    const session = await t.query(api.session.get, { id: sessionId });
    expect(session).toMatchObject({
      sandboxId,
      cwd: "/home/user",
    });
  });

  test("get retrieves a created session", async () => {
    const t = convexTest(schema, modules);
    const sandboxId = await t.mutation(api.sandbox.create, {
      name: "test-sandbox",
    });
    const sessionId = await t.mutation(api.session.create, {
      sandboxId,
      cwd: "/tmp",
    });
    const session = await t.query(api.session.get, { id: sessionId });
    expect(session).not.toBeNull();
    expect(session!._id).toBe(sessionId);
    expect(session!.cwd).toBe("/tmp");
  });

  test("get returns null for non-existent id", async () => {
    const t = convexTest(schema, modules);
    const sandboxId = await t.mutation(api.sandbox.create, {
      name: "test-sandbox",
    });
    const sessionId = await t.mutation(api.session.create, {
      sandboxId,
      cwd: "/tmp",
    });
    await t.mutation(api.session.remove, { id: sessionId });
    const session = await t.query(api.session.get, { id: sessionId });
    expect(session).toBeNull();
  });

  test("listBySandbox returns sessions for a given sandbox", async () => {
    const t = convexTest(schema, modules);
    const sandboxId = await t.mutation(api.sandbox.create, {
      name: "test-sandbox",
    });
    await t.mutation(api.session.create, { sandboxId, cwd: "/home" });
    await t.mutation(api.session.create, { sandboxId, cwd: "/tmp" });
    await t.mutation(api.session.create, { sandboxId, cwd: "/var" });

    const sessions = await t.query(api.session.listBySandbox, {
      sandboxId,
    });
    expect(sessions).toHaveLength(3);
    expect(sessions.map((s) => s.cwd)).toEqual(
      expect.arrayContaining(["/home", "/tmp", "/var"])
    );
  });

  test("listBySandbox returns empty for sandbox with no sessions", async () => {
    const t = convexTest(schema, modules);
    const sandboxId = await t.mutation(api.sandbox.create, {
      name: "empty-sandbox",
    });
    const sessions = await t.query(api.session.listBySandbox, {
      sandboxId,
    });
    expect(sessions).toEqual([]);
  });

  test("listBySandbox isolates by sandbox", async () => {
    const t = convexTest(schema, modules);
    const sandbox1 = await t.mutation(api.sandbox.create, {
      name: "sandbox-1",
    });
    const sandbox2 = await t.mutation(api.sandbox.create, {
      name: "sandbox-2",
    });
    await t.mutation(api.session.create, {
      sandboxId: sandbox1,
      cwd: "/s1",
    });
    await t.mutation(api.session.create, {
      sandboxId: sandbox2,
      cwd: "/s2-a",
    });
    await t.mutation(api.session.create, {
      sandboxId: sandbox2,
      cwd: "/s2-b",
    });

    const s1Sessions = await t.query(api.session.listBySandbox, {
      sandboxId: sandbox1,
    });
    const s2Sessions = await t.query(api.session.listBySandbox, {
      sandboxId: sandbox2,
    });
    expect(s1Sessions).toHaveLength(1);
    expect(s1Sessions[0].cwd).toBe("/s1");
    expect(s2Sessions).toHaveLength(2);
  });

  test("update changes the cwd", async () => {
    const t = convexTest(schema, modules);
    const sandboxId = await t.mutation(api.sandbox.create, {
      name: "test-sandbox",
    });
    const sessionId = await t.mutation(api.session.create, {
      sandboxId,
      cwd: "/old",
    });
    await t.mutation(api.session.update, { id: sessionId, cwd: "/new" });
    const session = await t.query(api.session.get, { id: sessionId });
    expect(session!.cwd).toBe("/new");
  });

  test("remove deletes the session", async () => {
    const t = convexTest(schema, modules);
    const sandboxId = await t.mutation(api.sandbox.create, {
      name: "test-sandbox",
    });
    const sessionId = await t.mutation(api.session.create, {
      sandboxId,
      cwd: "/tmp",
    });
    await t.mutation(api.session.remove, { id: sessionId });
    const session = await t.query(api.session.get, { id: sessionId });
    expect(session).toBeNull();
  });
});
