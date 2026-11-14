import type { Locator, Page } from '@playwright/test';
import { BookingCard } from '../components/BookingCard';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { BasePage } from './BasePage';

export class MyBookingsPage extends BasePage {
  protected readonly path = '/bookings';
  readonly heading: Locator;
  readonly bookingCards: Locator;
  readonly emptyState: Locator;
  readonly dialog: ConfirmDialog;
  protected readonly readyIndicator: Locator;

  constructor(page: Page) {
    super(page);
    this.heading = page.getByRole('heading', { name: 'My Bookings', level: 1 });
    this.bookingCards = page.getByTestId('booking-card');
    // Scoped to <main>: the footer has a "Browse Events" link on every page (verified 2026-11-14).
    this.emptyState = page.getByRole('main').getByRole('link', { name: 'Browse Events' });
    this.dialog = new ConfirmDialog(page);
    this.readyIndicator = this.heading;
  }

  /** Waits for the list request to settle (cards or empty state), not just the static heading. */
  override async waitUntilReady(): Promise<void> {
    await super.waitUntilReady();
    await this.bookingCards.first().or(this.emptyState).waitFor();
  }

  cardByRef(ref: string): BookingCard {
    return new BookingCard(this.bookingCards.filter({ has: this.page.locator('.booking-ref', { hasText: ref }) }));
  }

  async cancel(ref: string): Promise<void> {
    await this.cardByRef(ref).cancelButton.click();
    await this.dialog.confirm.click();
  }
}
