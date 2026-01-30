import type { IncomingMessage, ServerResponse } from "http";
import { normalizePath } from "./lib/paths.js";
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

export function route(req: IncomingMessage, res: ServerResponse): void {
  const method = (req.method ?? "GET").toUpperCase();
  const urlPath = normalizePath(req.url ?? "/");

  const handler = handlers[method];
  if (!handler) {
    res.writeHead(405, { Allow: Object.keys(handlers).join(", ") });
    res.end();
    return;
  }

  handler(req, res, urlPath).catch((err) => {
    console.error(`[${method} ${urlPath}] Error:`, err);
    if (!res.headersSent) {
      res.writeHead(500);
    }
    res.end("Internal Server Error");
  });
}
