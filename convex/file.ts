import { ConvexError, v } from "convex/values";
import { mutation, query, MutationCtx, QueryCtx } from "./_generated/server";
import { Id } from "./_generated/dataModel";

const pathExists = async (
  ctx: MutationCtx | QueryCtx,
  sandboxId: Id<"sandboxes">,
  path: string
) => {
  const existingFile = await ctx.db
    .query("files")
    .withIndex("bySandboxIdAndPath", (q) =>
      q.eq("sandboxId", sandboxId).eq("path", path)
    )
    .first();
  return existingFile !== null;
};

export const create = mutation({
  args: {
    sandboxId: v.id("sandboxes"),
    path: v.string(),
    storageId: v.id("_storage"),
  },
  handler: async (ctx, args) => {
    if (await pathExists(ctx, args.sandboxId, args.path)) {
      throw new ConvexError("Path already exists");
    }
    return await ctx.db.insert("files", {
      sandboxId: args.sandboxId,
      path: args.path,
      storageId: args.storageId,
    });
  },
});

export const get = query({
  args: { id: v.id("files") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id);
  },
});

export const listBySandbox = query({
  args: { sandboxId: v.id("sandboxes") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("files")
      .withIndex("bySandboxId", (q) => q.eq("sandboxId", args.sandboxId))
      .collect();
  },
});

export const update = mutation({
  args: {
    id: v.id("files"),
    path: v.optional(v.string()),
    storageId: v.optional(v.id("_storage")),
  },
  handler: async (ctx, args) => {
    const file = await ctx.db.get(args.id);
    if (!file) throw new ConvexError("File not found");
    if (
      args.path &&
      args.path !== file.path &&
      (await pathExists(ctx, file.sandboxId, args.path))
    ) {
      throw new ConvexError("Path already exists");
    }
    const updates: { path?: string; storageId?: Id<"_storage"> } = {};
    if (args.path) {
      updates.path = args.path;
    }
    if (args.storageId) {
      updates.storageId = args.storageId;
    }
    await ctx.db.patch(args.id, updates);
  },
});

export const getContentUrl = query({
  args: { id: v.id("files") },
  handler: async (ctx, args) => {
    const file = await ctx.db.get(args.id);
    if (!file) return null;
    return await ctx.storage.getUrl(file.storageId);
  },
});

export const remove = mutation({
  args: { id: v.id("files") },
  handler: async (ctx, args) => {
    await ctx.db.delete(args.id);
  },
});
