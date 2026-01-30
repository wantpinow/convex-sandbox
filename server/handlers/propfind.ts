import type { IncomingMessage, ServerResponse } from "http";
import { convex } from "../lib/convex-client.js";
import { api } from "../../convex/_generated/api.js";
import { multistatusXml } from "../lib/xml.js";
import type { FileMeta } from "../lib/types.js";

export async function handlePropfind(
  req: IncomingMessage,
  res: ServerResponse,
  sandboxId: string,
  urlPath: string
): Promise<void> {
  const depth = req.headers["depth"] ?? "1";

  const entries: Array<[string, FileMeta | null]> = [];

  if (urlPath === "/") {
    // Root is an implicit directory — always exists
    entries.push([`/${sandboxId}/`, null]);

    if (depth !== "0") {
      const children = (await convex.query(api.files.listDir, {
        tenantId: sandboxId,
        parentPath: "/",
      })) as FileMeta[];
      for (const child of children) {
        entries.push([`/${sandboxId}${child.path}`, child]);
      }
    }
  } else {
    const stat = (await convex.query(api.files.statPath, {
      tenantId: sandboxId,
      path: urlPath,
    })) as FileMeta | null;

    if (!stat) {
      res.writeHead(404);
      res.end("Not Found");
      return;
    }

    entries.push([`/${sandboxId}${stat.path}`, stat]);

    if (stat.type === "dir" && depth !== "0") {
      const children = (await convex.query(api.files.listDir, {
        tenantId: sandboxId,
        parentPath: stat.path,
      })) as FileMeta[];
      for (const child of children) {
        entries.push([`/${sandboxId}${child.path}`, child]);
      }
    }
  }

  const xml = multistatusXml(entries);
  const body = Buffer.from(xml, "utf-8");
  res.writeHead(207, {
    "Content-Type": "application/xml; charset=utf-8",
    "Content-Length": body.length,
  });
  res.end(body);
}
