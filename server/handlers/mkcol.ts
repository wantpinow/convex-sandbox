import type { IncomingMessage, ServerResponse } from "http";
import { convex } from "../lib/convex-client.js";
import { api } from "../../convex/_generated/api.js";
import { getParentPath, getBaseName } from "../lib/paths.js";

const TENANT = "default";

export async function handleMkcol(
  _req: IncomingMessage,
  res: ServerResponse,
  urlPath: string
): Promise<void> {
  if (urlPath === "/") {
    // Root always exists
    res.writeHead(405);
    res.end("Root directory already exists");
    return;
  }

  const name = getBaseName(urlPath);
  const parentPath = getParentPath(urlPath);

  await convex.mutation(api.files.ensureDir, {
    tenantId: TENANT,
    path: urlPath,
    name,
    parentPath,
  });

  res.writeHead(201, { "Content-Length": "0" });
  res.end();
}
