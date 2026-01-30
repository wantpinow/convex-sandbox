import type { IncomingMessage, ServerResponse } from "http";
import { convex } from "../lib/convex-client.js";
import { api } from "../../convex/_generated/api.js";

const TENANT = "default";

export async function handleDelete(
  _req: IncomingMessage,
  res: ServerResponse,
  urlPath: string
): Promise<void> {
  if (urlPath === "/") {
    res.writeHead(403);
    res.end("Cannot delete root");
    return;
  }

  await convex.mutation(api.files.deletePath, {
    tenantId: TENANT,
    path: urlPath,
  });

  res.writeHead(204, { "Content-Length": "0" });
  res.end();
}
