import { randomBytes, randomInt } from 'node:crypto';
import { env } from '@src/config/env';

export interface Customer {
  name: string;
  email: string;
  phone: string;
}

/**
 * Every booking created by the suite carries this marker in its customer e-mail.
 * It is what lets the global teardown find - and ONLY find - leftovers from the current run.
 */
export function runMarker(runId = env.runId): string {
  return `run-${runId}`;
}

const shortId = () => randomBytes(3).toString('hex');

/**
 * Unique, valid-by-construction customer data.
 *  - Unique per call (random suffix) -> no collisions between parallel workers or repeated runs.
 *  - Uses the reserved `example.com` domain (RFC 2606) -> never a real person's mailbox.
 *  - Phone: 10 digits starting with 9 -> satisfies both the UI rule (>=10 digits) and API rule (length >= 10).
 *  - Name: letters only -> no dependency on unverified rules about digits/symbols in names.
 */
export function buildCustomer(overrides: Partial<Customer> = {}): Customer {
  const id = shortId();
  return {
    name: `QA Tester ${id.replace(/\d/g, (d) => String.fromCharCode(97 + Number(d)))}`,
    email: `eventhub.qa+${runMarker()}-${id}@example.com`,
    phone: `9${String(randomInt(0, 1_000_000_000)).padStart(9, '0')}`,
    ...overrides,
  };
}
