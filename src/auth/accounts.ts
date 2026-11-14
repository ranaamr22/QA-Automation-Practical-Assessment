import { credentials, env, type Credentials } from '@src/config/env';

/**
 * Account resolution.
 *
 * WHY one account per worker: the app documents that a sandbox "holds up to 9 bookings ... when the
 * limit is reached, the oldest entry is automatically replaced". With a single shared account, parallel
 * workers would silently evict each other's bookings -> non-deterministic "booking not found" failures.
 * Every registered user gets an isolated sandbox (API docs), so isolating per worker removes the problem.
 *
 * Accounts are derived from ONE secret pair via plus-addressing and keyed by Playwright's `parallelIndex`
 * (stable 0..workers-1, unlike `workerIndex` which grows when a worker restarts), so the set of accounts
 * is bounded and reused across runs instead of registering new users on every execution.
 *
 *   base:  qa.engineer@example.com
 *   w0:    qa.engineer+ci-ui-w0@example.com
 *   other: qa.engineer+ci-ui-isolation@example.com  (second user for data-isolation tests)
 */
export interface TestAccount extends Credentials {
  /** Human readable role, used in logs instead of the e-mail. */
  label: string;
}

export function deriveEmail(baseEmail: string, tag: string): string {
  const [local, domain] = baseEmail.split('@');
  const separator = local.includes('+') ? '-' : '+';
  return `${local}${separator}${tag}@${domain}`;
}

export function workerAccount(parallelIndex: number): TestAccount {
  const base = credentials();
  if (env.accountStrategy === 'shared') {
    return { ...base, label: 'shared' };
  }
  // Local runs: the first worker signs in with the configured (real) account itself, so the
  // provided credentials are exercised end-to-end. CI jobs always use derived accounts because
  // several jobs run concurrently and must not share a sandbox.
  if (parallelIndex === 0 && env.accountNamespace === 'local') {
    return { ...base, label: 'primary' };
  }
  const tag = `${env.accountNamespace}-w${parallelIndex}`;
  return { email: deriveEmail(base.email, tag), password: base.password, label: tag };
}

/** A second, independent user - always derived, even with the "shared" strategy. */
export function isolationAccount(parallelIndex: number): TestAccount {
  const base = credentials();
  const tag = `${env.accountNamespace}-iso${parallelIndex}`;
  return { email: deriveEmail(base.email, tag), password: base.password, label: tag };
}
