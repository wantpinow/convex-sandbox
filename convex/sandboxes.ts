import { v } from "convex/values";
import { query, mutation } from "./_generated/server";

const SLUG_RE = /^[a-z0-9][a-z0-9-]{1,48}[a-z0-9]$/;

/** List all sandboxes, newest first. */
export const list = query({
  args: {},
  handler: async (ctx) => {
    const all = await ctx.db.query("sandboxes").collect();
    return all.sort((a, b) => b.createdAt - a.createdAt);
  },
});

/** Look up a sandbox by its URL-safe slug. */
export const getBySlug = query({
  args: { slug: v.string() },
  handler: async (ctx, { slug }) => {
    return await ctx.db
      .query("sandboxes")
      .withIndex("by_slug", (q) => q.eq("slug", slug))
      .first();
  },
});

/** Create a new sandbox. Validates slug format and uniqueness. */
export const create = mutation({
  args: { name: v.string(), slug: v.string() },
  handler: async (ctx, { name, slug }) => {
    if (!SLUG_RE.test(slug)) {
      throw new Error(
        "Slug must be 3-50 characters, lowercase alphanumeric and hyphens, cannot start/end with hyphen"
      );
    }

    const existing = await ctx.db
      .query("sandboxes")
      .withIndex("by_slug", (q) => q.eq("slug", slug))
      .first();
    if (existing) {
      throw new Error(`Sandbox with slug "${slug}" already exists`);
    }

    return await ctx.db.insert("sandboxes", {
      name,
      slug,
      createdAt: Date.now(),
    });
  },
});

/** Delete a sandbox and soft-delete all its files. */
export const remove = mutation({
  args: { slug: v.string() },
  handler: async (ctx, { slug }) => {
    const sandbox = await ctx.db
      .query("sandboxes")
      .withIndex("by_slug", (q) => q.eq("slug", slug))
      .first();
    if (!sandbox) {
      throw new Error(`Sandbox "${slug}" not found`);
    }

    // Soft-delete all files belonging to this sandbox
    const files = await ctx.db
      .query("files")
      .withIndex("by_tenant_path", (q) => q.eq("tenantId", slug))
      .collect();
    for (const file of files) {
      if (file.status !== "deleted") {
        await ctx.db.patch(file._id, { status: "deleted", mtime: Date.now() });
      }
    }

    // Hard-delete the sandbox record
    await ctx.db.delete(sandbox._id);
  },
});
