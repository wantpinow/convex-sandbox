"use node";

import { Agent, createTool } from "@convex-dev/agent";
import { gateway } from "@ai-sdk/gateway";
import { z } from "zod";
import { components, api } from "./_generated/api";
import { action } from "./_generated/server";
import { v } from "convex/values";

const execTool = createTool({
  description:
    "Execute a bash command in the sandbox. Returns stdout, stderr, and exit code. Use this to create files, run scripts, inspect the filesystem, etc.",
  inputSchema: z.object({
    command: z.string().describe("The bash command to execute"),
  }),
  execute: async (ctx, { command }): Promise<string> => {
    if (!ctx.threadId) throw new Error("No thread context");
    const mapping = await ctx.runQuery(api.agentQueries.getThreadMapping, {
      threadId: ctx.threadId,
    });
    if (!mapping) throw new Error("No sandbox linked to this thread");

    const result = await ctx.runAction(api.run.run, {
      sandboxId: mapping.sandboxId,
      sessionId: mapping.sessionId ?? undefined,
      command,
    });

    // Persist session so subsequent commands reuse it
    if (!mapping.sessionId) {
      await ctx.runMutation(api.agentQueries.setSessionId, {
        id: mapping._id,
        sessionId: result.sessionId,
      });
    }

    let output = "";
    if (result.stdout) output += result.stdout;
    if (result.stderr)
      output += (output ? "\n" : "") + "STDERR: " + result.stderr;
    if (!output) output = "(no output)";
    return `${output}\n[exit code: ${result.exitCode}]`;
  },
});

const sandboxAgent = new Agent(components.agent, {
  name: "Sandbox Agent",
  languageModel: gateway("anthropic/claude-sonnet-4-20250514"),
  instructions: `You are a helpful assistant with access to a bash sandbox environment.
You can execute commands using the exec tool — create files, run scripts, install packages, inspect the filesystem, etc.
Be concise. When you run commands, briefly explain what you're doing and show relevant output.
When commands fail, diagnose the issue and suggest or try a fix.`,
  tools: { exec: execTool },
  maxSteps: 10,
});

export const sendMessage = action({
  args: {
    sandboxId: v.id("sandboxes"),
    threadId: v.optional(v.string()),
    prompt: v.string(),
  },
  handler: async (ctx, args): Promise<{ threadId: string; text: string }> => {
    let threadId = args.threadId;

    if (!threadId) {
      threadId = await ctx.runMutation(api.agentQueries.createThread, {
        sandboxId: args.sandboxId,
      });
    }

    const result = await sandboxAgent.streamText(
      ctx,
      { threadId },
      { prompt: args.prompt },
      { saveStreamDeltas: true }
    );

    return {
      threadId,
      text: await result.text,
    };
  },
});

export { sandboxAgent };
