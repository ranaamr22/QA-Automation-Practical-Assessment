/**
 * Reads the `exp` claim of a JWT without verifying it (verification is the server's job).
 * Used only to refresh a token proactively before it expires (API docs: valid for 7 days).
 */
export function jwtExpiry(token: string): Date | undefined {
  const [, payload] = token.split('.');
  if (!payload) return undefined;
  try {
    const json = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as { exp?: number };
    return typeof json.exp === 'number' ? new Date(json.exp * 1000) : undefined;
  } catch {
    return undefined;
  }
}
