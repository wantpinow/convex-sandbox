import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  sandboxes: defineTable({
    name: v.string(),
  }),
  sessions: defineTable({
    sandboxId: v.id("sandboxes"),
    cwd: v.string(),
  }).index("bySandboxId", ["sandboxId"]),
  agentThreads: defineTable({
    threadId: v.string(),
    sandboxId: v.id("sandboxes"),
    sessionId: v.optional(v.id("sessions")),
  })
    .index("byThreadId", ["threadId"])
    .index("bySandboxId", ["sandboxId"]),
  files: defineTable({
    sandboxId: v.id("sandboxes"),
    path: v.string(),
    storageId: v.id("_storage"),
  })
    .index("bySandboxId", ["sandboxId"])
    .index("bySandboxIdAndPath", ["sandboxId", "path"]),
});
