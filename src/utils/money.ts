/**
 * The UI formats every amount with
 *   new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })
 * (verified in the production bundle), i.e. "$1,500" - whole dollars, rounded.
 *
 * Tests compare *numbers*, not strings, so a cosmetic formatting change does not break
 * pricing assertions, while a wrong amount still does.
 */
export function parseCurrency(text: string): number {
  const normalized = text.replace(/[^\d.-]/g, '');
  const value = Number(normalized);
  if (normalized === '' || Number.isNaN(value)) {
    throw new Error(`Cannot parse currency amount from "${text}"`);
  }
  return value;
}

/** The value the UI is expected to display for an exact amount (it rounds to whole dollars). */
export function displayedAmount(exact: number): number {
  return Math.round(exact);
}

/** Exact business total; rounded to cents to avoid floating point noise (e.g. 19.99 * 3). */
export function expectedTotal(unitPrice: number, quantity: number): number {
  return Math.round(unitPrice * quantity * 100) / 100;
}
