"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useQuery, useAction } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { useUIMessages } from "@convex-dev/agent/react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import {
  Loader2,
  Send,
  Terminal,
  Check,
  CircleAlert,
} from "lucide-react";
import { cn } from "@/lib/utils";

type ToolStatus = "running" | "success" | "error";

function ToolCallInline({
  command,
  status,
  output,
}: {
  command: string;
  status: ToolStatus;
  output?: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="my-1.5 rounded-md border bg-muted/40 text-xs">
      <button
        type="button"
        onClick={() => output && setOpen(!open)}
        className={cn(
          "flex w-full items-center gap-2 px-2.5 py-1.5 font-mono text-muted-foreground transition-colors",
          output && "cursor-pointer hover:text-foreground"
        )}
      >
        {status === "running" ? (
          <Loader2 className="size-3 shrink-0 animate-spin" />
        ) : status === "success" ? (
          <Check className="size-3 shrink-0 text-emerald-600" />
        ) : (
          <CircleAlert className="size-3 shrink-0 text-red-500" />
        )}
        <Terminal className="size-3 shrink-0" />
        <span className="truncate text-left">{command}</span>
      </button>
      {open && output && (
        <pre className="max-h-48 overflow-auto whitespace-pre-wrap border-t px-2.5 py-2 font-mono text-muted-foreground">
          {output}
        </pre>
      )}
    </div>
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Part = Record<string, any>;

function isExecToolPart(part: Part): boolean {
  return (
    typeof part.type === "string" &&
    part.type === "tool-exec"
  );
}

function getToolStatus(part: Part): ToolStatus {
  const state = part.state as string | undefined;
  if (state === "output-available") {
    // Parse exit code from output to distinguish success/error
    const output = typeof part.output === "string" ? part.output : "";
    const exitMatch = output.match(/\[exit code: (\d+)\]/);
    const exitCode = exitMatch ? parseInt(exitMatch[1]) : 0;
    return exitCode === 0 ? "success" : "error";
  }
  if (state === "output-error" || state === "output-denied") {
    return "error";
  }
  return "running";
}

function getToolCommand(part: Part): string {
  const input = part.input as Record<string, unknown> | undefined;
  if (input && typeof input.command === "string") {
    return input.command;
  }
  return JSON.stringify(input ?? part);
}

function MessageBubble({
  role,
  parts,
  text,
  isStreaming,
}: {
  role: string;
  parts: Part[];
  text: string;
  isStreaming: boolean;
}) {
  const isUser = role === "user";

  const hasTextParts = parts?.some(
    (p) => p.type === "text" && p.text?.trim()
  );
  const hasToolParts = parts?.some(isExecToolPart);

  return (
    <div className={cn("flex flex-col gap-0.5", isUser && "items-end")}>
      <span className="px-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground/50">
        {isUser ? "You" : "Agent"}
      </span>
      <div
        className={cn(
          "max-w-[90%] rounded-lg px-3 py-2 text-[13px] leading-relaxed",
          isUser
            ? "bg-foreground text-background"
            : "bg-muted/60 text-foreground"
        )}
      >
        {hasTextParts || hasToolParts
          ? parts.map((part, i) => {
              if (part.type === "text" && part.text?.trim()) {
                return (
                  <span key={i} className="whitespace-pre-wrap">
                    {part.text}
                  </span>
                );
              }
              if (part.type === "step-start") {
                return null;
              }
              if (isExecToolPart(part)) {
                const output =
                  typeof part.output === "string"
                    ? part.output
                    : part.output !== undefined
                      ? JSON.stringify(part.output, null, 2)
                      : undefined;
                return (
                  <ToolCallInline
                    key={i}
                    command={getToolCommand(part)}
                    status={getToolStatus(part)}
                    output={output}
                  />
                );
              }
              return null;
            })
          : text && <span className="whitespace-pre-wrap">{text}</span>}
        {isStreaming && !text && !hasTextParts && !hasToolParts && (
          <Loader2 className="size-3 animate-spin text-muted-foreground" />
        )}
      </div>
    </div>
  );
}

export function AgentPanel({ sandboxId }: { sandboxId: Id<"sandboxes"> }) {
  const threadId = useQuery(api.agentQueries.getThreadForSandbox, {
    sandboxId,
  });
  const sendMessage = useAction(api.agent.sendMessage);

  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [localThreadId, setLocalThreadId] = useState<string | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const activeThreadId = localThreadId ?? threadId;

  const { results: messages } = useUIMessages(
    api.agentQueries.listMessages,
    activeThreadId ? { threadId: activeThreadId } : "skip",
    { initialNumItems: 50, stream: true }
  );

  const scrollToBottom = useCallback(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, sending, scrollToBottom]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const prompt = input.trim();
    if (!prompt || sending) return;
    setInput("");
    setSending(true);

    try {
      const result = await sendMessage({
        sandboxId,
        threadId: activeThreadId ?? undefined,
        prompt,
      });
      if (!activeThreadId) {
        setLocalThreadId(result.threadId);
      }
    } finally {
      setSending(false);
      inputRef.current?.focus();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  return (
    <div className="flex h-full flex-col bg-background">
      {/* Header */}
      <div className="flex h-9 shrink-0 items-center gap-2 border-b bg-muted/30 px-3">
        <div className="size-2 rounded-full bg-emerald-500" />
        <span className="text-xs font-medium text-muted-foreground">
          Agent
        </span>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto">
        <div className="flex flex-col gap-3 p-3">
          {(!messages || messages.length === 0) && !sending && (
            <div className="flex flex-col items-center gap-2 py-12 text-center">
              <div className="flex size-10 items-center justify-center rounded-xl border bg-muted/40">
                <Terminal className="size-4 text-muted-foreground" />
              </div>
              <p className="text-xs text-muted-foreground">
                Ask the agent to help with your sandbox.
              </p>
            </div>
          )}

          {messages?.map((msg) => (
            <MessageBubble
              key={msg.key}
              role={msg.role}
              parts={
                msg.parts as Array<{
                  type: string;
                  text?: string;
                  toolName?: string;
                  args?: Record<string, unknown>;
                  result?: unknown;
                  state?: string;
                }>
              }
              text={msg.text ?? ""}
              isStreaming={msg.status === "streaming"}
            />
          ))}

          {sending && (!messages || messages.length === 0) && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="size-3 animate-spin" />
              Thinking...
            </div>
          )}

          <div ref={bottomRef} />
        </div>
      </div>

      {/* Input */}
      <form onSubmit={handleSubmit} className="shrink-0 border-t p-2">
        <div className="flex items-end gap-1.5 rounded-lg border bg-muted/30 px-2.5 py-1.5">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask the agent..."
            rows={3}
            className="flex-1 resize-none bg-transparent text-[13px] leading-relaxed text-foreground outline-none placeholder:text-muted-foreground/40"
            disabled={sending}
          />
          <Button
            type="submit"
            size="icon-xs"
            variant="ghost"
            disabled={!input.trim() || sending}
            className="shrink-0"
          >
            {sending ? (
              <Loader2 className="size-3 animate-spin" />
            ) : (
              <Send className="size-3" />
            )}
          </Button>
        </div>
      </form>
    </div>
  );
}
