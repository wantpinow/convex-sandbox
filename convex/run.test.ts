/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { expect, test, describe } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

describe("run", () => {
  test("auto-creates sandbox and session when neither provided", async () => {
    const t = convexTest(schema, modules);
    const result = await t.action(api.run.run, { command: "echo hello" });

    expect(result.sandboxId).toBeDefined();
    expect(result.sessionId).toBeDefined();
    expect(result.command).toBe("echo hello");
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("hello");

    // Verify sandbox was actually created in DB
    const sandbox = await t.query(api.sandbox.get, {
      id: result.sandboxId,
    });
    expect(sandbox).not.toBeNull();
    expect(sandbox!.name).toBe("Testing Sandbox");

    // Verify session was actually created in DB
    const session = await t.query(api.session.get, {
      id: result.sessionId,
    });
    expect(session).not.toBeNull();
  });

  test("uses provided sandboxId", async () => {
    const t = convexTest(schema, modules);
    const sandboxId = await t.mutation(api.sandbox.create, {
      name: "pre-existing",
    });

    const result = await t.action(api.run.run, {
      sandboxId,
      command: "echo test",
    });

    expect(result.sandboxId).toBe(sandboxId);
    // Should have auto-created a session
    expect(result.sessionId).toBeDefined();

    // Verify no extra sandbox was created
    const sandboxes = await t.query(api.sandbox.list);
    expect(sandboxes).toHaveLength(1);
    expect(sandboxes[0].name).toBe("pre-existing");
  });

  test("uses provided sessionId", async () => {
    const t = convexTest(schema, modules);
    const sandboxId = await t.mutation(api.sandbox.create, {
      name: "test",
    });
    const sessionId = await t.mutation(api.session.create, {
      sandboxId,
      cwd: "/custom/cwd",
    });

    const result = await t.action(api.run.run, {
      sandboxId,
      sessionId,
      command: "echo from-session",
    });

    expect(result.sandboxId).toBe(sandboxId);
    expect(result.sessionId).toBe(sessionId);
    expect(result.stdout).toContain("from-session");
  });

  test("returns correct shape", async () => {
    const t = convexTest(schema, modules);
    const result = await t.action(api.run.run, { command: "echo shape-test" });

    expect(result).toHaveProperty("stdout");
    expect(result).toHaveProperty("stderr");
    expect(result).toHaveProperty("exitCode");
    expect(result).toHaveProperty("sandboxId");
    expect(result).toHaveProperty("sessionId");
    expect(result).toHaveProperty("command");
    expect(typeof result.stdout).toBe("string");
    expect(typeof result.stderr).toBe("string");
    expect(typeof result.exitCode).toBe("number");
    expect(typeof result.command).toBe("string");
  });
});
