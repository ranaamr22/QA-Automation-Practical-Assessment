import type { Locator } from '@playwright/test';

/**
 * Ticket quantity stepper inside the booking form.
 *
 * Locator notes (evidence: production bundle):
 *  - Buttons have no aria-label; their accessible names are the glyphs "−" (U+2212 MINUS SIGN) and "+".
 *    We locate by those names (what a screen reader announces). They are not meaningful labels - a
 *    known accessibility finding listed in the README.
 *  - The value is a plain <span id="ticket-count"> with no role, so an id locator is the only option.
 */
export const MINUS_SIGN = '−';

export class QuantitySelector {
  readonly decrease: Locator;
  readonly increase: Locator;
  readonly value: Locator;
  readonly maxHint: Locator;
  readonly label: Locator;

  constructor(form: Locator) {
    this.decrease = form.getByRole('button', { name: MINUS_SIGN, exact: true });
    this.increase = form.getByRole('button', { name: '+', exact: true });
    this.value = form.locator('#ticket-count');
    this.maxHint = form.getByText(/^\(max \d+\)$/);
    this.label = form.locator('label', { hasText: /^Tickets$/ });
  }

  async current(): Promise<number> {
    return Number((await this.value.innerText()).trim());
  }

  async max(): Promise<number> {
    const text = await this.maxHint.innerText();
    return Number(text.replace(/\D/g, ''));
  }

  /**
   * Presses "+" up to `times` times, like a user would: stops as soon as the button is disabled (cap
   * reached). Tests that try to go beyond the cap then assert the value/disabled state themselves.
   */
  async increaseBy(times: number): Promise<void> {
    for (let i = 0; i < times && (await this.increase.isEnabled()); i++) await this.increase.click();
  }

  async decreaseBy(times: number): Promise<void> {
    for (let i = 0; i < times && (await this.decrease.isEnabled()); i++) await this.decrease.click();
  }

  /** Steps from the current value to `target` using the real buttons; fails if the target is unreachable. */
  async setTo(target: number): Promise<void> {
    const delta = target - (await this.current());
    if (delta > 0) await this.increaseBy(delta);
    if (delta < 0) await this.decreaseBy(-delta);
    const reached = await this.current();
    if (reached !== target) throw new Error(`Quantity stopped at ${reached}, target ${target} is outside the allowed range`);
  }
}
