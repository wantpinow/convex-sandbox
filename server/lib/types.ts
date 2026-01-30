import type { IncomingMessage, ServerResponse } from "http";

/** File/directory metadata as returned from Convex. */
export interface FileMeta {
  _id: string;
  tenantId: string;
  path: string;
  name: string;
  parentPath: string;
  type: "file" | "dir";
  size: number;
  mtime: number;
  objectKey?: string;
  version: number;
  status: "ready" | "pending" | "deleted";
}

/** A WebDAV request handler. */
export type DavHandler = (
  req: IncomingMessage,
  res: ServerResponse,
  sandboxId: string,
  urlPath: string
) => Promise<void>;
