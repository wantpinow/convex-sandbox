import type { IncomingMessage, ServerResponse } from "http";
import { normalizePath } from "./lib/paths.js";
import { convex } from "./lib/convex-client.js";
import { api } from "../convex/_generated/api.js";
import { handleOptions } from "./handlers/options.js";
import { handlePropfind } from "./handlers/propfind.js";
import { handleGet } from "./handlers/get.js";
import { handleHead } from "./handlers/head.js";
import { handlePut } from "./handlers/put.js";
import { handleMkcol } from "./handlers/mkcol.js";
import { handleMove } from "./handlers/move.js";
import { handleDelete } from "./handlers/delete.js";
import type { DavHandler } from "./lib/types.js";

const handlers: Record<string, DavHandler> = {
  OPTIONS: handleOptions,
  PROPFIND: handlePropfind,
  GET: handleGet,
  HEAD: handleHead,
  PUT: handlePut,
  MKCOL: handleMkcol,
  MOVE: handleMove,
  DELETE: handleDelete,
};

/**
 * Split a full request path into sandboxId and file path.
 * E.g. "/my-sandbox/docs/readme.txt" → { sandboxId: "my-sandbox", filePath: "/docs/readme.txt" }
 *      "/my-sandbox"                 → { sandboxId: "my-sandbox", filePath: "/" }
 *      "/"                           → null (no sandbox ID)
 */
function parseSandboxPath(
  fullPath: string
): { sandboxId: string; filePath: string } | null {
  // Remove leading slash and split
  const withoutLeading = fullPath.startsWith("/")
    ? fullPath.slice(1)
    : fullPath;
  if (!withoutLeading) return null;

  const slashIdx = withoutLeading.indexOf("/");
  if (slashIdx === -1) {
    return { sandboxId: withoutLeading, filePath: "/" };
  }
  const sandboxId = withoutLeading.slice(0, slashIdx);
  const rest = withoutLeading.slice(slashIdx); // includes leading /
  return { sandboxId, filePath: normalizePath(rest) };
}

export function route(req: IncomingMessage, res: ServerResponse): void {
  const method = (req.method ?? "GET").toUpperCase();
  const fullPath = normalizePath(req.url ?? "/");

  const handler = handlers[method];
  if (!handler) {
    res.writeHead(405, { Allow: Object.keys(handlers).join(", ") });
    res.end();
    return;
  }

  const parsed = parseSandboxPath(fullPath);
  if (!parsed) {
    res.writeHead(400);
    res.end("Missing sandbox ID in URL. Use /{sandboxId}/path");
    return;
  }

  const { sandboxId, filePath } = parsed;

  // Validate sandbox exists, then dispatch
  convex
    .query(api.sandboxes.getBySlug, { slug: sandboxId })
    .then((sandbox) => {
      if (!sandbox) {
        res.writeHead(404);
        res.end(`Sandbox "${sandboxId}" not found`);
        return;
      }
      return handler(req, res, sandboxId, filePath);
    })
    .catch((err) => {
      console.error(`[${method} ${fullPath}] Error:`, err);
      if (!res.headersSent) {
        res.writeHead(500);
      }
      res.end("Internal Server Error");
    });
}
