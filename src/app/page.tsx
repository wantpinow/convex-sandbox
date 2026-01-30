"use client";

import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 50);
}

export default function Home() {
  const sandboxes = useQuery(api.sandboxes.list);
  const createSandbox = useMutation(api.sandboxes.create);
  const removeSandbox = useMutation(api.sandboxes.remove);

  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugEdited, setSlugEdited] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const effectiveSlug = slugEdited ? slug : slugify(name);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setCreating(true);
    try {
      await createSandbox({ name: name.trim(), slug: effectiveSlug });
      setName("");
      setSlug("");
      setSlugEdited(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create sandbox");
    } finally {
      setCreating(false);
    }
  }

  async function handleDelete(sandboxSlug: string) {
    try {
      await removeSandbox({ slug: sandboxSlug });
      setConfirmDelete(null);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to delete sandbox"
      );
    }
  }

  return (
    <div className="flex min-h-screen items-start justify-center bg-zinc-50 font-sans dark:bg-black">
      <main className="w-full max-w-2xl px-6 py-16">
        <h1 className="text-2xl font-semibold tracking-tight text-black dark:text-zinc-50">
          Sandboxes
        </h1>
        <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
          Each sandbox has an isolated filesystem backed by WebDAV + R2.
        </p>

        {/* Create form */}
        <form onSubmit={handleCreate} className="mt-8 flex flex-col gap-3">
          <div className="flex gap-3">
            <input
              type="text"
              placeholder="Sandbox name"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (!slugEdited) setSlug(slugify(e.target.value));
              }}
              className="flex-1 rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm text-black placeholder:text-zinc-400 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
              required
            />
            <input
              type="text"
              placeholder="slug"
              value={effectiveSlug}
              onChange={(e) => {
                setSlug(e.target.value);
                setSlugEdited(true);
              }}
              className="w-48 rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm font-mono text-black placeholder:text-zinc-400 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
              required
              pattern="[a-z0-9][a-z0-9\-]{1,48}[a-z0-9]"
              title="3-50 chars, lowercase alphanumeric and hyphens"
            />
            <button
              type="submit"
              disabled={creating || !effectiveSlug}
              className="rounded-md bg-black px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-50 dark:text-black dark:hover:bg-zinc-200"
            >
              Create
            </button>
          </div>
          {error && (
            <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
          )}
        </form>

        {/* Sandbox list */}
        <div className="mt-10 flex flex-col gap-3">
          {sandboxes === undefined ? (
            <p className="text-sm text-zinc-400">Loading...</p>
          ) : sandboxes.length === 0 ? (
            <p className="text-sm text-zinc-400">
              No sandboxes yet. Create one above.
            </p>
          ) : (
            sandboxes.map((sb) => (
              <div
                key={sb._id}
                className="flex items-center justify-between rounded-lg border border-zinc-200 bg-white px-4 py-3 dark:border-zinc-700 dark:bg-zinc-900"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-2">
                    <span className="font-medium text-black dark:text-zinc-50">
                      {sb.name}
                    </span>
                    <span className="font-mono text-xs text-zinc-400">
                      {sb.slug}
                    </span>
                  </div>
                  <p className="mt-1 truncate font-mono text-xs text-zinc-500 dark:text-zinc-400">
                    ./scripts/sandbox-shell.sh {sb.slug}
                  </p>
                </div>
                <div className="ml-4 flex-shrink-0">
                  {confirmDelete === sb.slug ? (
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleDelete(sb.slug)}
                        className="rounded-md bg-red-600 px-3 py-1 text-xs font-medium text-white hover:bg-red-700"
                      >
                        Confirm
                      </button>
                      <button
                        onClick={() => setConfirmDelete(null)}
                        className="rounded-md border border-zinc-300 px-3 py-1 text-xs font-medium text-zinc-600 hover:bg-zinc-50 dark:border-zinc-600 dark:text-zinc-400 dark:hover:bg-zinc-800"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setConfirmDelete(sb.slug)}
                      className="rounded-md border border-zinc-300 px-3 py-1 text-xs font-medium text-zinc-600 hover:bg-zinc-50 dark:border-zinc-600 dark:text-zinc-400 dark:hover:bg-zinc-800"
                    >
                      Delete
                    </button>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </main>
    </div>
  );
}
