/**
 * Redaction for everything that leaves the process (console, HTML report, CI artifacts).
 * Secrets are removed entirely; personal data is masked so a failure is still debuggable
 * ("was the e-mail sent at all? which domain?") without exposing the full value.
 */
const SECRET_KEYS = new Set(['password', 'token', 'authorization', 'accesstoken', 'refreshtoken', 'cookie', 'set-cookie']);
const PII_KEYS = new Set(['customeremail', 'customerphone', 'email', 'phone']);

export function maskEmail(value: string): string {
  const [local, domain] = value.split('@');
  if (!domain) return mask(value);
  return `${local.slice(0, 2)}***@${domain}`;
}

function mask(value: string): string {
  if (value.length <= 4) return '***';
  return `${value.slice(0, 2)}***${value.slice(-2)}`;
}

function redactValue(key: string, value: unknown): unknown {
  const k = key.toLowerCase();
  if (SECRET_KEYS.has(k)) {
    if (typeof value === 'string' && /^bearer /i.test(value)) return 'Bearer ***';
    return '***';
  }
  if (PII_KEYS.has(k) && typeof value === 'string') {
    return value.includes('@') ? maskEmail(value) : mask(value);
  }
  return redact(value);
}

export function redact<T>(input: T): T {
  if (Array.isArray(input)) return input.map((v) => redact(v)) as T;
  if (input && typeof input === 'object') {
    return Object.fromEntries(
      Object.entries(input as Record<string, unknown>).map(([k, v]) => [k, redactValue(k, v)]),
    ) as T;
  }
  // Defensive: a raw JWT that slipped into free text.
  if (typeof input === 'string') {
    return input.replace(/eyJ[\w-]+\.[\w-]+\.[\w-]+/g, '<jwt>') as T;
  }
  return input;
}
