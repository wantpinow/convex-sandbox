import { v } from "convex/values";
import { action } from "./_generated/server";
import { api } from "./_generated/api";
import { Id } from "./_generated/dataModel";

export const run = action({
  args: {
    sandboxId: v.optional(v.id("sandboxes")),
    sessionId: v.optional(v.id("sessions")),
    command: v.string(),
  },
  handler: async (ctx, args) => {
    let sandboxId: Id<"sandboxes">;
    let sessionId: Id<"sessions">;

    if (args.sandboxId) {
      sandboxId = args.sandboxId;
    } else {
      sandboxId = await ctx.runMutation(api.sandbox.create, {
        name: "Testing Sandbox",
      });
    }

    if (args.sessionId) {
      sessionId = args.sessionId;
    } else {
      sessionId = await ctx.runMutation(api.session.create, {
        sandboxId,
        cwd: "/home/user",
      });
    }

    const result: { stdout: string; stderr: string; exitCode: number } =
      await ctx.runAction(api.exec.exec, {
        sessionId,
        command: args.command,
      });

    return { ...result, sandboxId, sessionId, command: args.command };
  },
});
