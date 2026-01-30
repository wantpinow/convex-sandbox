import type { IncomingMessage, ServerResponse } from "http";

const ALLOWED = "OPTIONS, PROPFIND, GET, HEAD, PUT, MKCOL, MOVE, DELETE";

export async function handleOptions(
  _req: IncomingMessage,
  res: ServerResponse,
  _sandboxId: string,
  _urlPath: string
): Promise<void> {
  res.writeHead(200, {
    DAV: "1",
    Allow: ALLOWED,
    "Content-Length": "0",
  });
  res.end();
}
