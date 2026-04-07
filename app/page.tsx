"use client";

import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import Link from "next/link";
import { Plus, ArrowRight, Trash2, Terminal, Box } from "lucide-react";

export default function Home() {
  const sandboxes = useQuery(api.sandbox.list);
  const createSandbox = useMutation(api.sandbox.create);
  const removeSandbox = useMutation(api.sandbox.remove);
  const [name, setName] = useState("");

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    await createSandbox({ name: trimmed });
    setName("");
  };

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-8 px-6 py-16">
      <div>
        <div className="flex items-center gap-3 mb-2">
          <div className="flex size-9 items-center justify-center rounded-lg bg-foreground text-background">
            <Terminal className="size-4" />
          </div>
          <h1 className="text-xl font-semibold tracking-tight">
            Convex Sandboxes
          </h1>
        </div>
        <p className="text-sm text-muted-foreground">
          Filesystem sandboxing, using only Convex serverless functions. No VMs.
        </p>
      </div>

      <form onSubmit={handleCreate} className="flex gap-2">
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Sandbox name..."
          className="h-9"
        />
        <Button type="submit" size="sm" disabled={!name.trim() || undefined}>
          <Plus className="size-3.5" data-icon="inline-start" />
          Create
        </Button>
      </form>

      <div className="flex flex-col">
        {sandboxes === undefined ? (
          <div className="py-12 text-center text-sm text-muted-foreground">
            Loading...
          </div>
        ) : sandboxes.length === 0 ? (
          <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed py-12">
            <Box className="size-8 text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground">
              No sandboxes yet. Create one above.
            </p>
          </div>
        ) : (
          <div className="divide-y rounded-lg border">
            {sandboxes.map((sandbox) => (
              <div
                key={sandbox._id}
                className="group flex items-center gap-3 px-4 py-3"
              >
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-sm font-medium">
                    {sandbox.name}
                  </span>
                  <span className="font-mono text-xs text-muted-foreground">
                    {sandbox._id.slice(0, 12)}...
                  </span>
                </div>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  onClick={() => removeSandbox({ id: sandbox._id })}
                  className="text-muted-foreground opacity-0 hover:text-destructive group-hover:opacity-100"
                >
                  <Trash2 className="size-3.5" />
                </Button>
                <Link href={`/${sandbox._id}`}>
                  <Button variant="ghost" size="icon-xs">
                    <ArrowRight className="size-3.5" />
                  </Button>
                </Link>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
