export interface ByteRange {
  start: number;
  end: number; // inclusive
}

/**
 * Parse a Range header like "bytes=0-499" or "bytes=500-".
 * Returns null if the header is missing or unparseable.
 */
export function parseRange(
  header: string | undefined,
  totalSize: number
): ByteRange | null {
  if (!header) return null;
  const match = header.match(/^bytes=(\d*)-(\d*)$/);
  if (!match) return null;

  const [, startStr, endStr] = match;

  let start: number;
  let end: number;

  if (startStr === "" && endStr !== "") {
    // Suffix range: bytes=-500 means last 500 bytes
    const suffix = parseInt(endStr, 10);
    start = Math.max(0, totalSize - suffix);
    end = totalSize - 1;
  } else if (endStr === "" && startStr !== "") {
    // Open-ended: bytes=500-
    start = parseInt(startStr, 10);
    end = totalSize - 1;
  } else {
    start = parseInt(startStr, 10);
    end = parseInt(endStr, 10);
  }

  if (isNaN(start) || isNaN(end) || start > end || start >= totalSize) {
    return null;
  }

  end = Math.min(end, totalSize - 1);
  return { start, end };
}
