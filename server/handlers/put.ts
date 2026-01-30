import type { IncomingMessage, ServerResponse } from "http";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { convex } from "../lib/convex-client.js";
import { r2, R2_BUCKET } from "../lib/r2-client.js";
import { api } from "../../convex/_generated/api.js";
import { getParentPath, getBaseName } from "../lib/paths.js";
import type { Id } from "../../convex/_generated/dataModel.js";

const TENANT = "default";

/** Collect the full request body into a Buffer. */
function collectBody(req: IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

export async function handlePut(
  req: IncomingMessage,
  res: ServerResponse,
  urlPath: string
): Promise<void> {
  if (urlPath === "/") {
    res.writeHead(403);
    res.end("Cannot write to root");
    return;
  }

  const body = await collectBody(req);
  const name = getBaseName(urlPath);
  const parentPath = getParentPath(urlPath);

  // Reserve a slot in Convex (pending state)
  const { id, objectKey } = await convex.mutation(api.files.beginWrite, {
    tenantId: TENANT,
    path: urlPath,
    name,
    parentPath,
    size: body.length,
  });

  // Upload blob to R2
  await r2.send(
    new PutObjectCommand({
      Bucket: R2_BUCKET,
      Key: objectKey,
      Body: body,
      ContentLength: body.length,
    })
  );

  // Commit: flip to ready
  await convex.mutation(api.files.commitWrite, {
    id: id as Id<"files">,
    size: body.length,
  });

  res.writeHead(201, {
    "Content-Length": "0",
    ETag: `"${objectKey}"`,
  });
  res.end();
}
