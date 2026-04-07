"use client";

import { useState } from "react";
import { ChevronRight, File, Folder } from "lucide-react";
import { cn } from "@/lib/utils";

interface TreeNode {
  name: string;
  path: string;
  children: TreeNode[];
}

function buildTree(paths: string[]): TreeNode[] {
  const root: TreeNode = { name: "", path: "", children: [] };

  for (const path of paths) {
    const parts = path.split("/").filter(Boolean);
    let current = root;

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      const partPath = "/" + parts.slice(0, i + 1).join("/");
      let child = current.children.find((c) => c.name === part);
      if (!child) {
        child = { name: part, path: partPath, children: [] };
        current.children.push(child);
      }
      current = child;
    }
  }

  const sortNodes = (nodes: TreeNode[]): TreeNode[] => {
    return nodes
      .map((n) => ({ ...n, children: sortNodes(n.children) }))
      .sort((a, b) => {
        const aIsDir = a.children.length > 0 ? 0 : 1;
        const bIsDir = b.children.length > 0 ? 0 : 1;
        if (aIsDir !== bIsDir) return aIsDir - bIsDir;
        return a.name.localeCompare(b.name);
      });
  };

  return sortNodes(root.children);
}

function TreeItem({
  node,
  depth,
  selectedPath,
  onSelect,
}: {
  node: TreeNode;
  depth: number;
  selectedPath: string | null;
  onSelect: (path: string) => void;
}) {
  const [open, setOpen] = useState(true);
  const isFolder = node.children.length > 0;
  const isSelected = !isFolder && node.path === selectedPath;

  return (
    <div>
      <button
        type="button"
        onClick={() => {
          if (isFolder) {
            setOpen(!open);
          } else {
            onSelect(node.path);
          }
        }}
        className={cn(
          "flex w-full items-center gap-1.5 rounded-md px-1.5 py-1 text-[13px] leading-none",
          "transition-colors",
          isSelected
            ? "bg-accent text-accent-foreground"
            : "text-foreground/80 hover:bg-muted hover:text-foreground"
        )}
        style={{ paddingLeft: `${depth * 16 + 6}px` }}
      >
        {isFolder ? (
          <ChevronRight
            className={cn(
              "size-3.5 shrink-0 text-muted-foreground/60 transition-transform duration-150",
              open && "rotate-90"
            )}
          />
        ) : (
          <span className="w-3.5" />
        )}
        {isFolder ? (
          <Folder className="size-3.5 shrink-0 text-muted-foreground" />
        ) : (
          <File className="size-3.5 shrink-0 text-muted-foreground" />
        )}
        <span className="truncate font-mono">{node.name}</span>
      </button>
      {isFolder && open && (
        <div>
          {node.children.map((child) => (
            <TreeItem
              key={child.path}
              node={child}
              depth={depth + 1}
              selectedPath={selectedPath}
              onSelect={onSelect}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function FileTree({
  paths,
  selectedPath,
  onSelect,
}: {
  paths: string[];
  selectedPath: string | null;
  onSelect: (path: string) => void;
}) {
  const tree = buildTree(paths);

  if (tree.length === 0) {
    return (
      <p className="px-3 py-4 text-[13px] text-muted-foreground">
        No files yet
      </p>
    );
  }

  return (
    <div className="py-1">
      {tree.map((node) => (
        <TreeItem
          key={node.path}
          node={node}
          depth={0}
          selectedPath={selectedPath}
          onSelect={onSelect}
        />
      ))}
    </div>
  );
}
