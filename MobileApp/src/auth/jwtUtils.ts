export interface JwtPayloadClient {
  sub?: string;
  role?: string;
  childId?: string;
}

export function decodeJwtPayload(token: string): JwtPayloadClient | null {
  try {
    const parts = token.split('.');
    if (parts.length < 2) {
      return null;
    }
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=');
    if (typeof atob !== 'function') {
      return null;
    }
    const json = atob(padded);
    return JSON.parse(json) as JwtPayloadClient;
  } catch {
    return null;
  }
}
