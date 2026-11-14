import type { Locator, Page } from '@playwright/test';

/** Global notification region (`aria-live="polite"`), used for API errors and success messages. */
export class Toast {
  readonly region: Locator;

  constructor(page: Page) {
    this.region = page.locator('div[aria-live="polite"]');
  }

  message(text: string | RegExp): Locator {
    return this.region.getByText(text).first();
  }
}
