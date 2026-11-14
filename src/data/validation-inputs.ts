/**
 * Data tables for validation tests, shared by UI and API specs so both layers are held to the same rules.
 *
 * Source of each rule (see README "Story Review"):
 *  - UI (bundle):  name.trim() && length >= 2 | email /^[^\s@]+@[^\s@]+\.[^\s@]+$/ | phone has >= 10 digits
 *  - API (OpenAPI): customerName minLength 2 | customerEmail format email | customerPhone minLength 10
 *                   | quantity integer 1..10 | eventId integer, must exist
 *
 * `source` documents whether a case is backed by documentation ("documented") or is a proposed rule
 * the Product Owner still has to confirm ("proposed"). Proposed cases are tagged @proposed in the specs.
 */
export type RuleSource = 'documented' | 'proposed';

export interface InvalidCase {
  title: string;
  value: unknown;
  source: RuleSource;
  /** Confirmed defect id (README) - the test is expected to fail until the bug is fixed. */
  knownDefect?: string;
}

export const INVALID_EMAILS: InvalidCase[] = [
  { title: 'missing @', value: 'qa.tester.example.com', source: 'documented' },
  { title: 'missing domain', value: 'qa.tester@', source: 'documented' },
  { title: 'missing TLD', value: 'qa.tester@example', source: 'documented' },
  { title: 'contains space', value: 'qa tester@example.com', source: 'documented' },
  // RFC 5321/5322 basics - the UI accepts these (BUG-05); does the server?
  { title: 'consecutive dots in the domain', value: 'qa.tester@example..com', source: 'proposed' },
  { title: 'consecutive dots in the local part', value: 'qa..tester@example.com', source: 'proposed' },
  { title: 'domain starts with a dot', value: 'qa.tester@.example.com', source: 'proposed' },
  { title: 'longer than 254 characters', value: `${'a'.repeat(250)}@example.com`, source: 'proposed' },
  // Wrong JSON types (documented type: string)
  { title: 'number instead of string', value: 12345, source: 'documented' },
  { title: 'array instead of string', value: ['qa.tester@example.com'], source: 'documented', knownDefect: 'BUG-07' },
];

export const INVALID_PHONES: InvalidCase[] = [
  { title: 'too short (9 digits)', value: '987654321', source: 'documented' },
  { title: 'whitespace only', value: '          ', source: 'documented' },
  // Docs only say minLength 10, but the live API rejects letters (verified 2026-11-14).
  { title: 'letters only (10 chars)', value: 'abcdefghij', source: 'proposed' },
  // No upper bound on either layer (verified: API answers 201). Letters mixed in ARE rejected by the API.
  { title: 'too long (20 digits)', value: '98765432101234567890', source: 'proposed', knownDefect: 'BUG-01' },
  { title: 'letters mixed into digits', value: '98765abcde43210', source: 'proposed' },
  { title: '11 digits (no country code)', value: '98765432101', source: 'proposed', knownDefect: 'BUG-01' },
  { title: '100 digits', value: '9'.repeat(100), source: 'proposed', knownDefect: 'BUG-01' },
  { title: 'number instead of string', value: 9876543210, source: 'documented', knownDefect: 'BUG-06' },
];

export const INVALID_NAMES: InvalidCase[] = [
  { title: 'single character', value: 'A', source: 'documented' },
  // Docs only say minLength 2, but the live API rejects whitespace-only names (verified 2026-11-14).
  { title: 'whitespace only', value: '   ', source: 'proposed' },
  // UI bug mirrors (BUG-03/04): does the server accept them too?
  { title: 'one real character with a leading space', value: ' A', source: 'proposed' },
  { title: 'digits only', value: '12345', source: 'proposed', knownDefect: 'BUG-04' },
  { title: 'symbols only', value: '!@#$%', source: 'proposed', knownDefect: 'BUG-04' },
  { title: 'longer than 255 characters', value: 'A'.repeat(256), source: 'proposed', knownDefect: 'BUG-07' },
  { title: 'number instead of string', value: 12345, source: 'documented', knownDefect: 'BUG-06' },
  { title: 'object instead of string', value: { first: 'Priya' }, source: 'documented', knownDefect: 'BUG-06' },
];

export const INVALID_QUANTITIES: InvalidCase[] = [
  { title: 'zero (below minimum)', value: 0, source: 'documented' },
  { title: 'eleven (above maximum)', value: 11, source: 'documented' },
  { title: 'negative', value: -1, source: 'documented' },
  { title: 'decimal', value: 1.5, source: 'documented' },
  { title: 'numeric string', value: '2', source: 'documented', knownDefect: 'BUG-06' }, // verified: coerced, 201
  { title: 'null', value: null, source: 'documented' },
  { title: 'far above maximum (1,000,000)', value: 1_000_000, source: 'documented' },
  { title: 'boolean true', value: true, source: 'documented' },
  { title: 'array', value: [2], source: 'documented', knownDefect: 'BUG-07' },
];

export const INVALID_EVENT_IDS: Array<InvalidCase & { expectedStatus: 400 | 404 }> = [
  { title: 'non-existent id', value: 999_999_999, expectedStatus: 404, source: 'documented' },
  { title: 'non-numeric id', value: 'abc', expectedStatus: 400, source: 'documented' },
  { title: 'zero', value: 0, expectedStatus: 400, source: 'proposed' },
  { title: 'negative id', value: -1, expectedStatus: 400, source: 'proposed' },
  { title: 'decimal id', value: 1.5, expectedStatus: 400, source: 'documented' },
  { title: 'null', value: null, expectedStatus: 400, source: 'documented' },
];
