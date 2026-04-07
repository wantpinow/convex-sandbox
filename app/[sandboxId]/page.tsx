"use client";

import { use, useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { FileTree } from "@/components/file-tree";
import { FileViewer } from "@/components/file-viewer";
import { Terminal } from "@/components/terminal";
import { AgentPanel } from "@/components/agent-panel";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import {
  Panel,
  Group,
  Separator,
} from "react-resizable-panels";
import Link from "next/link";
import {
  ArrowLeft,
  FolderOpen,
  GripHorizontal,
  GripVertical,
  Bot,
} from "lucide-react";

export default function SandboxPage({
  params,
}: {
  params: Promise<{ sandboxId: string }>;
}) {
  const { sandboxId } = use(params);
  const typedSandboxId = sandboxId as Id<"sandboxes">;

  const sandbox = useQuery(api.sandbox.get, { id: typedSandboxId });
  const files = useQuery(api.file.listBySandbox, {
    sandboxId: typedSandboxId,
  });

  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [agentOpen, setAgentOpen] = useState(true);

  const selectedFile = files?.find((f) => f.path === selectedPath) ?? null;

  return (
    <div className="h-dvh overflow-hidden">
      <Group orientation="horizontal">
        {/* Sidebar */}
        <Panel defaultSize="18%" minSize="10%" maxSize="35%">
          <aside className="flex h-full flex-col bg-muted/30">
            <div className="flex flex-col gap-1 border-b px-3 py-3">
              <Link
                href="/"
                className="flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
              >
                <ArrowLeft className="size-3" />
                All sandboxes
              </Link>
              <h2 className="truncate text-sm font-semibold">
                {sandbox?.name ?? "..."}
              </h2>
            </div>

            <div className="flex items-center gap-1.5 border-b px-3 py-2">
              <FolderOpen className="size-3.5 text-muted-foreground" />
              <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Files
              </span>
            </div>

            <ScrollArea className="flex-1">
              <FileTree
                paths={files?.map((f) => f.path) ?? []}
                selectedPath={selectedPath}
                onSelect={setSelectedPath}
              />
            </ScrollArea>
          </aside>
        </Panel>

        <Separator className="group relative flex w-px items-center justify-center bg-border transition-colors data-[separator-active]:bg-ring">
          <div className="z-10 flex h-6 w-3 items-center justify-center rounded-sm opacity-0 transition-opacity group-hover:opacity-100 group-data-[separator-active]:opacity-100">
            <GripVertical className="size-2.5 text-muted-foreground" />
          </div>
        </Separator>

        {/* Main area */}
        <Panel minSize="30%">
          <Group orientation="vertical">
            {/* File viewer */}
            <Panel defaultSize="70%" minSize="20%">
              <div className="flex h-full flex-col overflow-hidden">
                {/* Agent toggle in the tab bar */}
                <div className="flex h-9 shrink-0 items-center justify-between border-b bg-muted/30 px-3">
                  <div className="flex items-center">
                    {selectedFile ? (
                      <div className="flex items-center gap-1.5 rounded-md bg-background px-2.5 py-1 text-[13px] font-medium shadow-[0_0_0_1px_var(--border)]">
                        {selectedFile.path.split("/").pop()}
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground">
                        No file open
                      </span>
                    )}
                  </div>
                  <Button
                    variant={agentOpen ? "default" : "outline"}
                    size="xs"
                    onClick={() => setAgentOpen(!agentOpen)}
                  >
                    <Bot className="size-3" data-icon="inline-start" />
                    Agent
                  </Button>
                </div>

                <div className="flex-1 overflow-hidden">
                  <FileViewer fileId={selectedFile?._id ?? null} />
                </div>
              </div>
            </Panel>

            <Separator className="group relative flex h-px items-center justify-center bg-border transition-colors data-[separator-active]:bg-ring">
              <div className="z-10 flex h-3 w-6 items-center justify-center rounded-sm opacity-0 transition-opacity group-hover:opacity-100 group-data-[separator-active]:opacity-100">
                <GripHorizontal className="size-2.5 text-muted-foreground" />
              </div>
            </Separator>

            {/* Terminal */}
            <Panel defaultSize="30%" minSize="15%">
              <div className="flex h-full flex-col overflow-hidden">
                <Terminal sandboxId={typedSandboxId} />
              </div>
            </Panel>
          </Group>
        </Panel>

        {/* Agent panel */}
        {agentOpen && (
          <>
            <Separator className="group relative flex w-px items-center justify-center bg-border transition-colors data-[separator-active]:bg-ring">
              <div className="z-10 flex h-6 w-3 items-center justify-center rounded-sm opacity-0 transition-opacity group-hover:opacity-100 group-data-[separator-active]:opacity-100">
                <GripVertical className="size-2.5 text-muted-foreground" />
              </div>
            </Separator>
            <Panel defaultSize="25%" minSize="15%" maxSize="50%">
              <AgentPanel sandboxId={typedSandboxId} />
            </Panel>
          </>
        )}
      </Group>
    </div>
  );
}
