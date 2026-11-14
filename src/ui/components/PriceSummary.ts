import type { Locator } from '@playwright/test';
import { parseCurrency } from '@src/utils/money';

/**
 * Price breakdown at the bottom of the booking form:
 *   "$1,500 × 2 tickets      $3,000"
 *   "Total                   $3,000"
 * No test ids exist, so locators anchor on the visible "Total" label and the "×" breakdown line.
 * (Recommendation to the dev team: add data-testid="booking-total" - see README "Limitations and next steps".)
 */
export class PriceSummary {
  readonly breakdown: Locator;
  readonly total: Locator;

  constructor(form: Locator) {
    this.breakdown = form.getByText(/×\s*\d+\s*tickets?$/);
    this.total = form.locator('span:text-is("Total") + span');
  }

  async totalValue(): Promise<number> {
    return parseCurrency(await this.total.innerText());
  }
}
