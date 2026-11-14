import { expect, type Locator, type Page } from '@playwright/test';
import { Toast } from '../components/Toast';

/**
 * Shared page behaviour: navigation, notifications and "ready" detection.
 * Business actions live in concrete pages; assertions live in specs.
 */
export abstract class BasePage {
  readonly toast: Toast;

  protected constructor(readonly page: Page) {
    this.toast = new Toast(page);
  }

  protected abstract readonly path: string;

  /** Each page defines the element whose visibility means "rendered with data". */
  protected abstract readonly readyIndicator: Locator;

  async goto(): Promise<this> {
    await this.page.goto(this.path);
    await this.waitUntilReady();
    return this;
  }

  async waitUntilReady(): Promise<void> {
    await expect(this.readyIndicator, `${this.constructor.name} did not render`).toBeVisible();
  }
}
