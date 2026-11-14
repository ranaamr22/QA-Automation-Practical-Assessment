import * as dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config({ quiet: true } as dotenv.DotenvConfigOptions);

/**
 * Single source of truth for runtime configuration.
 *
 * - Validated once with zod so a misconfigured run fails immediately with a clear message
 *   instead of producing confusing 401s or timeouts deep inside a test.
 * - Credentials are only read lazily (`credentials()`), so commands that need no
 *   credentials (`tsc`, `playwright test --list`) work on a fresh clone.
 */
const booleanFromString = z
  .enum(['true', 'false', '1', '0'])
  .transform((v) => v === 'true' || v === '1');

const EnvSchema = z.object({
  EVENTHUB_BASE_URL: z.string().url().default('https://eventhub.rahulshettyacademy.com'),
  EVENTHUB_API_URL: z.string().url().default('https://api.eventhub.rahulshettyacademy.com/api'),
  EVENTHUB_ACCOUNT_STRATEGY: z.enum(['per-worker', 'shared']).default('per-worker'),
  EVENTHUB_ACCOUNT_NAMESPACE: z
    .string()
    .regex(/^[a-z0-9-]{1,20}$/i, 'only letters, digits and dashes (max 20)')
    .default('local'),
  EVENTHUB_AUTO_REGISTER: booleanFromString.default('true'),
  DEBUG_API: booleanFromString.default('0'),
  CI: z.string().optional(),
});

const CredentialsSchema = z.object({
  EVENTHUB_EMAIL: z.string().email('EVENTHUB_EMAIL must be a valid e-mail address'),
  EVENTHUB_PASSWORD: z.string().min(8, 'EVENTHUB_PASSWORD must be at least 8 characters'),
});

function parse<T extends z.ZodTypeAny>(schema: T, source: NodeJS.ProcessEnv): z.infer<T> {
  // Treat empty strings as "not set" so `.env.example` copied verbatim falls back to defaults.
  const cleaned = Object.fromEntries(Object.entries(source).filter(([, v]) => v !== ''));
  const result = schema.safeParse(cleaned);
  if (!result.success) {
    const issues = result.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Invalid test configuration:\n${issues}\nSee .env.example / README "Credentials and environment variables".`);
  }
  return result.data;
}

const raw = parse(EnvSchema, process.env);

export const env = {
  baseUrl: raw.EVENTHUB_BASE_URL.replace(/\/$/, ''),
  /** Always ends with a trailing slash so relative paths resolve under /api/. */
  apiUrl: `${raw.EVENTHUB_API_URL.replace(/\/$/, '')}/`,
  accountStrategy: raw.EVENTHUB_ACCOUNT_STRATEGY,
  accountNamespace: raw.EVENTHUB_ACCOUNT_NAMESPACE.toLowerCase(),
  autoRegister: raw.EVENTHUB_AUTO_REGISTER,
  debugApi: raw.DEBUG_API,
  isCI: Boolean(raw.CI),
  /** Unique per `playwright test` invocation; set in playwright.config.ts and inherited by workers. */
  get runId(): string {
    return process.env.TEST_RUN_ID ?? 'adhoc';
  },
} as const;

export interface Credentials {
  email: string;
  password: string;
}

let cachedCredentials: Credentials | undefined;

export function credentials(): Credentials {
  if (!cachedCredentials) {
    const c = parse(CredentialsSchema, process.env);
    cachedCredentials = { email: c.EVENTHUB_EMAIL, password: c.EVENTHUB_PASSWORD };
  }
  return cachedCredentials;
}
