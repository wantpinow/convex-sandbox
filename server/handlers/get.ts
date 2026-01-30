import type { IncomingMessage, ServerResponse } from "http";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { convex } from "../lib/convex-client.js";
import { r2, R2_BUCKET } from "../lib/r2-client.js";
import { api } from "../../convex/_generated/api.js";
import { parseRange } from "../lib/range.js";
import type { FileMeta } from "../lib/types.js";
import type { Readable } from "stream";

const TENANT = "default";

export async function handleGet(
  req: IncomingMessage,
  res: ServerResponse,
  urlPath: string
): Promise<void> {
  const stat = (await convex.query(api.files.statPath, {
    tenantId: TENANT,
    path: urlPath,
  })) as FileMeta | null;

  if (!stat || stat.type === "dir") {
    res.writeHead(stat ? 405 : 404);
    res.end(stat ? "Cannot GET a directory" : "Not Found");
    return;
  }

  if (!stat.objectKey) {
    res.writeHead(404);
    res.end("No object key");
    return;
  }

  const rangeHeader = req.headers["range"] as string | undefined;
  const range = parseRange(rangeHeader, stat.size);

  const cmd: ConstructorParameters<typeof GetObjectCommand>[0] = {
    Bucket: R2_BUCKET,
    Key: stat.objectKey,
  };

  if (range) {
    cmd.Range = `bytes=${range.start}-${range.end}`;
  }

  const r2Resp = await r2.send(new GetObjectCommand(cmd));

  if (!r2Resp.Body) {
    res.writeHead(502);
    res.end("Empty response from R2");
    return;
  }

  const headers: Record<string, string | number> = {
    "Content-Type": "application/octet-stream",
    "Last-Modified": new Date(stat.mtime).toUTCString(),
    "Accept-Ranges": "bytes",
    ETag: `"${stat.version}"`,
  };

  if (range) {
    headers["Content-Range"] =
      `bytes ${range.start}-${range.end}/${stat.size}`;
    headers["Content-Length"] = range.end - range.start + 1;
    res.writeHead(206, headers);
  } else {
    headers["Content-Length"] = stat.size;
    res.writeHead(200, headers);
  }

  const stream = r2Resp.Body as Readable;
  stream.pipe(res);
}
