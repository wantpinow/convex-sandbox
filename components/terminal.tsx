"use client";

import {
  useState,
  useRef,
  useEffect,
  useCallback,
  type KeyboardEvent,
} from "react";
import { useQuery, useMutation, useAction } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2, Plus, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

interface HistoryEntry {
  command: string;
  stdout: string;
  stderr: string;
  exitCode: number;
}

export function Terminal({ sandboxId }: { sandboxId: Id<"sandboxes"> }) {
  const sessions = useQuery(api.session.listBySandbox, { sandboxId });
  const createSession = useMutation(api.session.create);
  const run = useAction(api.run.run);

  const [activeSessionId, setActiveSessionId] =
    useState<Id<"sessions"> | null>(null);
  const [historyMap, setHistoryMap] = useState<
    Record<string, HistoryEntry[]>
  >({});
  const [input, setInput] = useState("");
  const [running, setRunning] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const history = activeSessionId ? historyMap[activeSessionId] ?? [] : [];

  // Get the active session's cwd from the sessions list
  const activeSession = sessions?.find((s) => s._id === activeSessionId);

  const scrollToBottom = useCallback(() => {
    if (scrollRef.current) {
      const viewport = scrollRef.current.querySelector(
        "[data-radix-scroll-area-viewport]"
      );
      if (viewport) {
        viewport.scrollTop = viewport.scrollHeight;
      }
    }
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [history, running, scrollToBottom]);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node)
      ) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cmd = input;
    if (!cmd || running) return;
    setInput("");
    setRunning(true);

    try {
      let sessionId = activeSessionId;

      // Auto-create session on first command
      if (!sessionId) {
        sessionId = await createSession({
          sandboxId,
          cwd: "/home/user",
        });
        setActiveSessionId(sessionId);
      }

      const result = await run({
        sandboxId,
        sessionId,
        command: cmd,
      });

      const entry: HistoryEntry = {
        command: cmd,
        stdout: result.stdout,
        stderr: result.stderr,
        exitCode: result.exitCode,
      };

      setHistoryMap((prev) => ({
        ...prev,
        [sessionId as string]: [...(prev[sessionId as string] ?? []), entry],
      }));
    } catch (err) {
      const entry: HistoryEntry = {
        command: cmd,
        stdout: "",
        stderr: err instanceof Error ? err.message : "Unknown error",
        exitCode: 1,
      };

      if (activeSessionId) {
        setHistoryMap((prev) => ({
          ...prev,
          [activeSessionId]: [...(prev[activeSessionId] ?? []), entry],
        }));
      }
    } finally {
      setRunning(false);
      inputRef.current?.focus();
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    // Prevent form submission on Enter when running
    if (e.key === "Enter" && running) {
      e.preventDefault();
    }
  };

  const selectSession = (id: Id<"sessions"> | null) => {
    setActiveSessionId(id);
    setDropdownOpen(false);
    inputRef.current?.focus();
  };

  return (
    <div
      className="flex flex-col"
      onClick={(e) => {
        // Focus input when clicking terminal body, but not header buttons
        if ((e.target as HTMLElement).closest("[data-terminal-header]")) return;
        inputRef.current?.focus();
      }}
    >
      {/* Header */}
      <div
        data-terminal-header
        className="flex h-9 shrink-0 items-center gap-2 border-b bg-muted/30 px-3"
      >
        <span className="text-xs font-medium text-muted-foreground">
          Terminal
        </span>

        {/* Session selector */}
        <div ref={dropdownRef} className="relative">
          <button
            type="button"
            onClick={() => setDropdownOpen(!dropdownOpen)}
            className="flex items-center gap-1 rounded-md px-2 py-0.5 font-mono text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            {activeSessionId
              ? activeSession?.cwd ?? "..."
              : "New session"}
            <ChevronDown className="size-3" />
          </button>

          {dropdownOpen && (
            <div className="absolute left-0 top-full z-50 mt-1 min-w-[180px] rounded-md border bg-popover p-1 shadow-md">
              <button
                type="button"
                onClick={() => selectSession(null)}
                className={cn(
                  "flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-xs transition-colors",
                  !activeSessionId
                    ? "bg-accent text-accent-foreground"
                    : "text-popover-foreground hover:bg-muted"
                )}
              >
                <Plus className="size-3" />
                New session
              </button>
              {sessions?.map((session) => (
                <button
                  key={session._id}
                  type="button"
                  onClick={() => selectSession(session._id)}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-sm px-2 py-1.5 font-mono text-xs transition-colors",
                    activeSessionId === session._id
                      ? "bg-accent text-accent-foreground"
                      : "text-popover-foreground hover:bg-muted"
                  )}
                >
                  {session.cwd}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Terminal body */}
      <ScrollArea ref={scrollRef} className="flex-1">
        <div className="p-3 font-mono text-[13px] leading-relaxed">
          {/* Empty state */}
          {history.length === 0 && !running && (
            <div className="text-muted-foreground/40">
              {activeSessionId
                ? "Type a command..."
                : "Type a command to start a new session."}
            </div>
          )}

          {/* History */}
          {history.map((entry, i) => (
            <div key={i} className="mb-2">
              <div className="flex gap-2">
                <span className="select-none text-muted-foreground/40">$</span>
                <span className="text-foreground">{entry.command}</span>
              </div>
              {entry.stdout && (
                <pre className="mt-0.5 whitespace-pre-wrap pl-5 text-foreground/70">
                  {entry.stdout}
                </pre>
              )}
              {entry.stderr && (
                <pre className="mt-0.5 whitespace-pre-wrap pl-5 text-red-600">
                  {entry.stderr}
                </pre>
              )}
              {entry.exitCode !== 0 && (
                <div className="mt-0.5 pl-5 text-muted-foreground/30 text-xs">
                  exit {entry.exitCode}
                </div>
              )}
            </div>
          ))}

          {/* Running indicator */}
          {running && (
            <div className="flex items-center gap-2 text-muted-foreground/40">
              <Loader2 className="size-3 animate-spin" />
              <span className="text-xs">Running...</span>
            </div>
          )}

          {/* Input */}
          {!running && (
            <form onSubmit={handleSubmit} className="flex gap-2">
              <span className="select-none text-muted-foreground/40">$</span>
              <input
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                className="flex-1 bg-transparent text-foreground caret-foreground outline-none placeholder:text-muted-foreground/25"
                placeholder="Type a command..."
                autoFocus
                spellCheck={false}
                autoComplete="off"
                autoCapitalize="none"
              />
            </form>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
