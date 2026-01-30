import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  files: defineTable({
    tenantId: v.string(),
    path: v.string(),
    name: v.string(),
    parentPath: v.string(),
    type: v.union(v.literal("file"), v.literal("dir")),
    size: v.number(),
    mtime: v.number(),
    objectKey: v.optional(v.string()),
    version: v.number(),
    status: v.union(
      v.literal("ready"),
      v.literal("pending"),
      v.literal("deleted")
    ),
  })
    .index("by_tenant_path", ["tenantId", "path", "status"])
    .index("by_tenant_parent", ["tenantId", "parentPath", "status"])
    .index("by_status", ["status"]),

  sandboxes: defineTable({
    name: v.string(),
    slug: v.string(),
    createdAt: v.number(),
  }).index("by_slug", ["slug"]),
});
