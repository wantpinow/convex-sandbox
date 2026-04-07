import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

export const create = mutation({
  args: { name: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db.insert("sandboxes", { name: args.name });
  },
});

export const get = query({
  args: { id: v.id("sandboxes") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id);
  },
});

export const list = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("sandboxes").take(100);
  },
});

export const update = mutation({
  args: { id: v.id("sandboxes"), name: v.string() },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, { name: args.name });
  },
});

export const remove = mutation({
  args: { id: v.id("sandboxes") },
  handler: async (ctx, args) => {
    // Delete child sessions
    const sessions = await ctx.db
      .query("sessions")
      .withIndex("bySandboxId", (q) => q.eq("sandboxId", args.id))
      .collect();
    for (const session of sessions) {
      await ctx.db.delete(session._id);
    }
    // Delete child files and their storage objects
    const files = await ctx.db
      .query("files")
      .withIndex("bySandboxId", (q) => q.eq("sandboxId", args.id))
      .collect();
    for (const file of files) {
      await ctx.storage.delete(file.storageId);
      await ctx.db.delete(file._id);
    }
    // Delete agent thread mappings
    const threads = await ctx.db
      .query("agentThreads")
      .withIndex("bySandboxId", (q) => q.eq("sandboxId", args.id))
      .collect();
    for (const thread of threads) {
      await ctx.db.delete(thread._id);
    }
    await ctx.db.delete(args.id);
  },
});
