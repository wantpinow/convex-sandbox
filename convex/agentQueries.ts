import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { components } from "./_generated/api";
import { paginationOptsValidator } from "convex/server";
import {
  createThread as agentCreateThread,
  listUIMessages,
  syncStreams,
} from "@convex-dev/agent";
import { vStreamArgs } from "@convex-dev/agent/validators";

export const createThread = mutation({
  args: { sandboxId: v.id("sandboxes") },
  handler: async (ctx, args) => {
    const threadId = await agentCreateThread(ctx, components.agent, {});
    await ctx.db.insert("agentThreads", {
      threadId,
      sandboxId: args.sandboxId,
    });
    return threadId;
  },
});

export const getThreadForSandbox = query({
  args: { sandboxId: v.id("sandboxes") },
  handler: async (ctx, args) => {
    const mapping = await ctx.db
      .query("agentThreads")
      .withIndex("bySandboxId", (q) => q.eq("sandboxId", args.sandboxId))
      .first();
    return mapping?.threadId ?? null;
  },
});

export const getThreadMapping = query({
  args: { threadId: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("agentThreads")
      .withIndex("byThreadId", (q) => q.eq("threadId", args.threadId))
      .first();
  },
});

export const setSessionId = mutation({
  args: { id: v.id("agentThreads"), sessionId: v.id("sessions") },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, { sessionId: args.sessionId });
  },
});

export const listMessages = query({
  args: {
    threadId: v.string(),
    paginationOpts: paginationOptsValidator,
    streamArgs: vStreamArgs,
  },
  handler: async (ctx, args) => {
    const paginated = await listUIMessages(ctx, components.agent, args);
    const streams = await syncStreams(ctx, components.agent, args);
    return { ...paginated, streams };
  },
});
