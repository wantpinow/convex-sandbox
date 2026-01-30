import type { IncomingMessage, ServerResponse } from "http";
import { convex } from "../lib/convex-client.js";
import { api } from "../../convex/_generated/api.js";
import type { FileMeta } from "../lib/types.js";

const TENANT = "default";

export async function handleHead(
  _req: IncomingMessage,
  res: ServerResponse,
  urlPath: string
): Promise<void> {
  const stat = (await convex.query(api.files.statPath, {
    tenantId: TENANT,
    path: urlPath,
  })) as FileMeta | null;

  if (!stat) {
    res.writeHead(404);
    res.end();
    return;
  }

  const headers: Record<string, string | number> = {
    "Last-Modified": new Date(stat.mtime).toUTCString(),
    ETag: `"${stat.version}"`,
  };

  if (stat.type === "file") {
    headers["Content-Type"] = "application/octet-stream";
    headers["Content-Length"] = stat.size;
    headers["Accept-Ranges"] = "bytes";
  }

  res.writeHead(200, headers);
  res.end();
}
