/** Normalize a URL path: remove trailing slashes, collapse doubles, ensure leading /. */
export function normalizePath(raw: string): string {
  let p = decodeURIComponent(raw);
  // Collapse double slashes
  p = p.replace(/\/+/g, "/");
  // Remove trailing slash (but keep root)
  if (p.length > 1 && p.endsWith("/")) {
    p = p.slice(0, -1);
  }
  // Ensure leading slash
  if (!p.startsWith("/")) {
    p = "/" + p;
  }
  return p;
}

/** Get the parent path of a given path. "/" returns "/". */
export function getParentPath(path: string): string {
  if (path === "/") return "/";
  const idx = path.lastIndexOf("/");
  return idx <= 0 ? "/" : path.slice(0, idx);
}

/** Get the base name (last segment) of a path. */
export function getBaseName(path: string): string {
  if (path === "/") return "";
  const idx = path.lastIndexOf("/");
  return path.slice(idx + 1);
}
