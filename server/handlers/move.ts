import type { IncomingMessage, ServerResponse } from "http";
import { convex } from "../lib/convex-client.js";
import { api } from "../../convex/_generated/api.js";
import { normalizePath, getParentPath, getBaseName } from "../lib/paths.js";

export async function handleMove(
  req: IncomingMessage,
  res: ServerResponse,
  sandboxId: string,
  urlPath: string
): Promise<void> {
  const destHeader = req.headers["destination"] as string | undefined;
  if (!destHeader) {
    res.writeHead(400);
    res.end("Missing Destination header");
    return;
  }

  // Destination can be a full URL or an absolute path
  let rawDstPath: string;
  try {
    const url = new URL(destHeader);
    rawDstPath = normalizePath(url.pathname);
  } catch {
    rawDstPath = normalizePath(destHeader);
  }

  // Strip the /{sandboxId} prefix from the destination path
  const prefix = `/${sandboxId}`;
  if (!rawDstPath.startsWith(prefix)) {
    res.writeHead(400);
    res.end("Cross-sandbox moves are not allowed");
    return;
  }

  const dstPath =
    rawDstPath.length === prefix.length
      ? "/"
      : normalizePath(rawDstPath.slice(prefix.length));

  const dstName = getBaseName(dstPath);
  const dstParentPath = getParentPath(dstPath);

  await convex.mutation(api.files.movePath, {
    tenantId: sandboxId,
    srcPath: urlPath,
    dstPath,
    dstName,
    dstParentPath,
  });

  res.writeHead(201, { "Content-Length": "0" });
  res.end();
}
