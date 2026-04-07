"use client";

import { useEffect, useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { ScrollArea } from "@/components/ui/scroll-area";
import { File } from "lucide-react";

function useFileContent(url: string | null | undefined) {
  const [content, setContent] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!url) {
      setContent(null);
      return;
    }
    setLoading(true);
    fetch(url)
      .then((r) => r.text())
      .then((text) => {
        setContent(text);
        setLoading(false);
      })
      .catch(() => {
        setContent(null);
        setLoading(false);
      });
  }, [url]);

  return { content, loading };
}

export function FileViewer({ fileId }: { fileId: Id<"files"> | null }) {
  const url = useQuery(
    api.file.getContentUrl,
    fileId ? { id: fileId } : "skip"
  );
  const { content, loading } = useFileContent(url);

  if (!fileId) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 text-muted-foreground/40">
        <File className="size-10" strokeWidth={1} />
        <span className="text-sm">No file selected</span>
      </div>
    );
  }

  if (loading || url === undefined) {
    return (
      <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
        Loading...
      </div>
    );
  }

  const lines = (content ?? "").split("\n");
  // Remove trailing empty line if file ends with newline
  if (lines.length > 1 && lines[lines.length - 1] === "") {
    lines.pop();
  }

  return (
    <div className="flex flex-1 flex-col">
      <ScrollArea className="flex-1">
        <div className="p-4 font-mono text-[13px] leading-6">
          {lines.map((line, i) => (
            <div key={i} className="flex">
              <span className="inline-block w-10 shrink-0 select-none pr-4 text-right text-muted-foreground/40">
                {i + 1}
              </span>
              <span className="whitespace-pre-wrap break-all">
                {line || " "}
              </span>
            </div>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}
