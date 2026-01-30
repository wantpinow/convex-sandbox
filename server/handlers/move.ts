import type { IncomingMessage, ServerResponse } from "http";
import { convex } from "../lib/convex-client.js";
import { api } from "../../convex/_generated/api.js";
import { normalizePath, getParentPath, getBaseName } from "../lib/paths.js";

const TENANT = "default";

export async function handleMove(
  req: IncomingMessage,
  res: ServerResponse,
  urlPath: string
): Promise<void> {
  const destHeader = req.headers["destination"] as string | undefined;
  if (!destHeader) {
    res.writeHead(400);
    res.end("Missing Destination header");
    return;
  }

  // Destination can be a full URL or an absolute path
  let dstPath: string;
  try {
    const url = new URL(destHeader);
    dstPath = normalizePath(url.pathname);
  } catch {
    dstPath = normalizePath(destHeader);
  }

  const dstName = getBaseName(dstPath);
  const dstParentPath = getParentPath(dstPath);

  await convex.mutation(api.files.movePath, {
    tenantId: TENANT,
    srcPath: urlPath,
    dstPath,
    dstName,
    dstParentPath,
  });

  res.writeHead(201, { "Content-Length": "0" });
  res.end();
}
