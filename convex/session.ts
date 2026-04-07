import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

export const create = mutation({
  args: { sandboxId: v.id("sandboxes"), cwd: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db.insert("sessions", {
      sandboxId: args.sandboxId,
      cwd: args.cwd,
    });
  },
});

export const get = query({
  args: { id: v.id("sessions") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id);
  },
});

export const listBySandbox = query({
  args: { sandboxId: v.id("sandboxes") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("sessions")
      .withIndex("bySandboxId", (q) => q.eq("sandboxId", args.sandboxId))
      .take(100);
  },
});

export const update = mutation({
  args: { id: v.id("sessions"), cwd: v.string() },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, { cwd: args.cwd });
  },
});

export const remove = mutation({
  args: { id: v.id("sessions") },
  handler: async (ctx, args) => {
    await ctx.db.delete(args.id);
  },
});
