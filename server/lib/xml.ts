import type { FileMeta } from "./types.js";

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Format epoch-ms as an HTTP date string. */
function httpDate(ms: number): string {
  return new Date(ms).toUTCString();
}

/** Build a <d:response> element for one resource. */
function responseElement(href: string, meta: FileMeta | null): string {
  const isDir = meta === null || meta.type === "dir";
  const displayName = meta ? escapeXml(meta.name) : "";
  const lastMod = meta ? httpDate(meta.mtime) : httpDate(Date.now());
  const contentLength = meta ? meta.size : 0;

  const resourceType = isDir
    ? "<d:resourcetype><d:collection/></d:resourcetype>"
    : "<d:resourcetype/>";

  // Ensure directory hrefs end with /
  const normalizedHref = isDir && !href.endsWith("/") ? href + "/" : href;

  return `<d:response>
<d:href>${escapeXml(normalizedHref)}</d:href>
<d:propstat>
<d:prop>
${resourceType}
<d:displayname>${displayName}</d:displayname>
<d:getlastmodified>${lastMod}</d:getlastmodified>
<d:getcontentlength>${contentLength}</d:getcontentlength>
</d:prop>
<d:status>HTTP/1.1 200 OK</d:status>
</d:propstat>
</d:response>`;
}

/**
 * Build a 207 Multi-Status XML body.
 * @param entries  Array of [href, meta] pairs. `meta` can be null for the root dir.
 */
export function multistatusXml(
  entries: Array<[string, FileMeta | null]>
): string {
  const responses = entries.map(([href, meta]) => responseElement(href, meta));
  return `<?xml version="1.0" encoding="utf-8"?>
<d:multistatus xmlns:d="DAV:">
${responses.join("\n")}
</d:multistatus>`;
}
