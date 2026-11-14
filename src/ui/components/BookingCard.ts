import type { Locator } from '@playwright/test';
import { parseCurrency } from '@src/utils/money';

/** One booking tile on the My Bookings page (`data-testid="booking-card"`). */
export class BookingCard {
  readonly ref: Locator;
  readonly status: Locator;
  readonly eventTitle: Locator;
  readonly tickets: Locator;
  readonly total: Locator;
  readonly viewDetails: Locator;
  readonly cancelButton: Locator;

  constructor(readonly root: Locator) {
    this.ref = root.locator('.booking-ref');
    this.status = root.getByText(/^(confirmed|cancelled)$/);
    this.eventTitle = root.getByRole('heading', { level: 3 });
    this.tickets = root.getByText(/\d+ tickets?$/);
    this.total = root.locator('p', { hasText: /^\$[\d,]+$/ });
    this.viewDetails = root.getByRole('link', { name: 'View Details' });
    this.cancelButton = root.getByRole('button', { name: 'Cancel Booking' });
  }

  async ticketCount(): Promise<number> {
    return Number((await this.tickets.innerText()).replace(/\D/g, ''));
  }

  async totalValue(): Promise<number> {
    return parseCurrency(await this.total.innerText());
  }
}
