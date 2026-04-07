"use node";

import { action } from "./_generated/server";
import { ConvexError, v } from "convex/values";
import { Bash } from "just-bash";
import type { InitialFiles, IFileSystem } from "just-bash";
import { api } from "./_generated/api";
import { Doc } from "./_generated/dataModel";

export const exec = action({
  args: {
    sessionId: v.id("sessions"),
    command: v.string(),
  },
  handler: async (ctx, args) => {
    const session: Doc<"sessions"> | null = await ctx.runQuery(
      api.session.get,
      {
        id: args.sessionId,
      }
    );
    if (!session) throw new ConvexError("Session not found");

    const sandbox: Doc<"sandboxes"> | null = await ctx.runQuery(
      api.sandbox.get,
      {
        id: session.sandboxId,
      }
    );
    if (!sandbox) throw new ConvexError("Sandbox not found");

    const files: Doc<"files">[] = await ctx.runQuery(
      api.file.listBySandbox,
      {
        sandboxId: session.sandboxId,
      }
    );

    // Lazy callbacks — content is only fetched from storage when accessed.
    // defenseInDepth is disabled because the sandbox blocks globals that
    // Node's TLS layer needs for HTTPS fetches inside callbacks.
    const initialFiles: InitialFiles = {};
    for (const file of files) {
      const { storageId } = file;
      initialFiles[file.path] = async () => {
        const blob = await ctx.storage.get(storageId);
        if (!blob) return "";
        return await blob.text();
      };
    }

    const bash: Bash = new Bash({
      files: initialFiles,
      cwd: session.cwd,
      defenseInDepth: false,
    });

    // Track filesystem writes by intercepting mutating methods.
    const writtenPaths = new Set<string>();
    const deletedPaths = new Set<string>();
    const fs = bash.fs;

    const origWriteFile = fs.writeFile.bind(fs);
    fs.writeFile = async (...fsArgs: Parameters<IFileSystem["writeFile"]>) => {
      const path = fs.resolvePath(bash.getCwd(), fsArgs[0]);
      writtenPaths.add(path);
      deletedPaths.delete(path);
      return origWriteFile(...fsArgs);
    };

    const origAppendFile = fs.appendFile.bind(fs);
    fs.appendFile = async (
      ...fsArgs: Parameters<IFileSystem["appendFile"]>
    ) => {
      const path = fs.resolvePath(bash.getCwd(), fsArgs[0]);
      writtenPaths.add(path);
      deletedPaths.delete(path);
      return origAppendFile(...fsArgs);
    };

    const origRm = fs.rm.bind(fs);
    fs.rm = async (...fsArgs: Parameters<IFileSystem["rm"]>) => {
      const path = fs.resolvePath(bash.getCwd(), fsArgs[0]);
      deletedPaths.add(path);
      writtenPaths.delete(path);
      return origRm(...fsArgs);
    };

    const origMv = fs.mv.bind(fs);
    fs.mv = async (...fsArgs: Parameters<IFileSystem["mv"]>) => {
      const src = fs.resolvePath(bash.getCwd(), fsArgs[0]);
      const dest = fs.resolvePath(bash.getCwd(), fsArgs[1]);
      deletedPaths.add(src);
      writtenPaths.delete(src);
      writtenPaths.add(dest);
      deletedPaths.delete(dest);
      return origMv(...fsArgs);
    };

    const origCp = fs.cp.bind(fs);
    fs.cp = async (...fsArgs: Parameters<IFileSystem["cp"]>) => {
      const dest = fs.resolvePath(bash.getCwd(), fsArgs[1]);
      writtenPaths.add(dest);
      deletedPaths.delete(dest);
      return origCp(...fsArgs);
    };

    // Execute the command, appending a hidden pwd to capture the final cwd.
    // ExecOptions.cwd resets after each exec, so getCwd() won't reflect cd.
    const CWD_MARKER = "\x00__CWD__\x00";
    const result = await bash.exec(
      `${args.command}\n__exit_code=$?\necho "${CWD_MARKER}$(pwd)"\nexit $__exit_code`
    );

    // Extract the final cwd from stdout
    let stdout = result.stdout;
    let newCwd = session.cwd;
    const markerIdx = stdout.lastIndexOf(CWD_MARKER);
    if (markerIdx !== -1) {
      const afterMarker = stdout.slice(markerIdx + CWD_MARKER.length);
      newCwd = afterMarker.split("\n")[0].trim();
      stdout = stdout.slice(0, markerIdx);
    }

    // Persist written files back to Convex storage
    for (const path of writtenPaths) {
      try {
        const content = await bash.readFile(path);
        const blob = new Blob([content], { type: "text/plain" });
        const newStorageId = await ctx.storage.store(blob);
        const file = files.find((f) => f.path === path);
        if (file) {
          await ctx.runMutation(api.file.update, {
            id: file._id,
            storageId: newStorageId,
          });
        } else {
          await ctx.runMutation(api.file.create, {
            sandboxId: session.sandboxId,
            path,
            storageId: newStorageId,
          });
        }
      } catch {
        // File may have been written then deleted in the same command
      }
    }

    // Persist deletions
    for (const path of deletedPaths) {
      const file = files.find((f) => f.path === path);
      if (file) {
        await ctx.runMutation(api.file.remove, {
          id: file._id,
        });
      }
    }

    // Persist cwd if it changed
    if (newCwd !== session.cwd) {
      await ctx.runMutation(api.session.update, {
        id: session._id,
        cwd: newCwd,
      });
    }

    return {
      stdout,
      stderr: result.stderr,
      exitCode: result.exitCode,
    };
  },
});
