/** Last screenshot path (dev debug / optional re-classify). */
let lastPath: string | null = null;

export function setLastCapturePath(path: string): void {
  lastPath = path;
}

export function getLastCapturePath(): string | null {
  return lastPath;
}
