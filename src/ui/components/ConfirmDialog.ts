import type { Locator, Page } from '@playwright/test';

/** Modal used for destructive confirmations (role="dialog", aria-modal, labelled by its title). */
export class ConfirmDialog {
  readonly root: Locator;
  readonly title: Locator;
  readonly confirm: Locator;
  readonly close: Locator;

  constructor(page: Page) {
    this.root = page.getByRole('dialog');
    this.title = this.root.getByRole('heading');
    this.confirm = this.root.getByRole('button', { name: 'Yes, cancel it' });
    this.close = this.root.getByRole('button', { name: 'Close' });
  }
}
