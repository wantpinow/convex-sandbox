import { v } from "convex/values";
import { query, mutation } from "./_generated/server";

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

/** Return the metadata for a single path (file or dir), or null. */
export const statPath = query({
  args: { tenantId: v.string(), path: v.string() },
  handler: async (ctx, { tenantId, path }) => {
    const row = await ctx.db
      .query("files")
      .withIndex("by_tenant_path", (q) =>
        q.eq("tenantId", tenantId).eq("path", path).eq("status", "ready")
      )
      .first();
    return row ?? null;
  },
});

/** List immediate children of `parentPath`. */
export const listDir = query({
  args: { tenantId: v.string(), parentPath: v.string() },
  handler: async (ctx, { tenantId, parentPath }) => {
    return await ctx.db
      .query("files")
      .withIndex("by_tenant_parent", (q) =>
        q
          .eq("tenantId", tenantId)
          .eq("parentPath", parentPath)
          .eq("status", "ready")
      )
      .collect();
  },
});

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

/** Create a directory if it doesn't already exist. Returns the doc id. */
export const ensureDir = mutation({
  args: {
    tenantId: v.string(),
    path: v.string(),
    name: v.string(),
    parentPath: v.string(),
  },
  handler: async (ctx, { tenantId, path, name, parentPath }) => {
    const existing = await ctx.db
      .query("files")
      .withIndex("by_tenant_path", (q) =>
        q.eq("tenantId", tenantId).eq("path", path).eq("status", "ready")
      )
      .first();
    if (existing) {
      if (existing.type !== "dir") {
        throw new Error(`${path} exists and is not a directory`);
      }
      return existing._id;
    }
    return await ctx.db.insert("files", {
      tenantId,
      path,
      name,
      parentPath,
      type: "dir",
      size: 0,
      mtime: Date.now(),
      version: 1,
      status: "ready",
    });
  },
});

/**
 * Reserve a file entry in "pending" state before uploading to R2.
 * Returns { id, objectKey } so the caller knows where to PUT the blob.
 */
export const beginWrite = mutation({
  args: {
    tenantId: v.string(),
    path: v.string(),
    name: v.string(),
    parentPath: v.string(),
    size: v.number(),
  },
  handler: async (ctx, { tenantId, path, name, parentPath, size }) => {
    // Tombstone any previous ready version
    const prev = await ctx.db
      .query("files")
      .withIndex("by_tenant_path", (q) =>
        q.eq("tenantId", tenantId).eq("path", path).eq("status", "ready")
      )
      .first();

    const nextVersion = prev ? prev.version + 1 : 1;
    const objectKey = `${tenantId}${path}::v${nextVersion}`;

    if (prev) {
      await ctx.db.patch(prev._id, { status: "deleted" });
    }

    const id = await ctx.db.insert("files", {
      tenantId,
      path,
      name,
      parentPath,
      type: "file",
      size,
      mtime: Date.now(),
      objectKey,
      version: nextVersion,
      status: "pending",
    });

    return { id, objectKey };
  },
});

/** Flip a pending file to ready after R2 upload succeeds. */
export const commitWrite = mutation({
  args: { id: v.id("files"), size: v.number() },
  handler: async (ctx, { id, size }) => {
    const doc = await ctx.db.get(id);
    if (!doc || doc.status !== "pending") {
      throw new Error("Cannot commit: file not in pending state");
    }
    await ctx.db.patch(id, { status: "ready", size, mtime: Date.now() });
  },
});

/** Move / rename a path. Only supports single-file moves for now. */
export const movePath = mutation({
  args: {
    tenantId: v.string(),
    srcPath: v.string(),
    dstPath: v.string(),
    dstName: v.string(),
    dstParentPath: v.string(),
  },
  handler: async (ctx, { tenantId, srcPath, dstPath, dstName, dstParentPath }) => {
    const src = await ctx.db
      .query("files")
      .withIndex("by_tenant_path", (q) =>
        q.eq("tenantId", tenantId).eq("path", srcPath).eq("status", "ready")
      )
      .first();
    if (!src) throw new Error(`Source not found: ${srcPath}`);

    // Tombstone any existing file at the destination
    const dst = await ctx.db
      .query("files")
      .withIndex("by_tenant_path", (q) =>
        q.eq("tenantId", tenantId).eq("path", dstPath).eq("status", "ready")
      )
      .first();
    if (dst) {
      await ctx.db.patch(dst._id, { status: "deleted" });
    }

    await ctx.db.patch(src._id, {
      path: dstPath,
      name: dstName,
      parentPath: dstParentPath,
      mtime: Date.now(),
    });
  },
});

/** Soft-delete a path (set status → deleted). */
export const deletePath = mutation({
  args: { tenantId: v.string(), path: v.string() },
  handler: async (ctx, { tenantId, path }) => {
    // Delete the entry itself
    const entry = await ctx.db
      .query("files")
      .withIndex("by_tenant_path", (q) =>
        q.eq("tenantId", tenantId).eq("path", path).eq("status", "ready")
      )
      .first();
    if (!entry) return;
    await ctx.db.patch(entry._id, { status: "deleted", mtime: Date.now() });

    // If it's a directory, recursively delete children
    if (entry.type === "dir") {
      const children = await ctx.db
        .query("files")
        .withIndex("by_tenant_parent", (q) =>
          q.eq("tenantId", tenantId).eq("parentPath", path).eq("status", "ready")
        )
        .collect();
      for (const child of children) {
        await ctx.db.patch(child._id, { status: "deleted", mtime: Date.now() });
      }
    }
  },
});
