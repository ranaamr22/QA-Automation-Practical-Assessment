import type { Locator, Page } from '@playwright/test';
import { parseCurrency } from '@src/utils/money';

/**
 * Inline confirmation that replaces the booking form after a successful booking (no URL change).
 * Label/value rows are rendered as `<div><span>Label</span><span>Value</span></div>`.
 */
export class BookingConfirmation {
  readonly heading: Locator;
  readonly bookingRef: Locator;
  readonly viewMyBookings: Locator;
  readonly browseMoreEvents: Locator;

  constructor(private readonly page: Page) {
    this.heading = page.getByRole('heading', { name: /Booking Confirmed/i });
    this.bookingRef = page.locator('.booking-ref');
    this.viewMyBookings = page.getByRole('link', { name: 'View My Bookings' });
    this.browseMoreEvents = page.getByRole('link', { name: 'Browse More Events' });
  }

  value(label: 'Booking Ref' | 'Customer' | 'Tickets' | 'Total'): Locator {
    return this.page.locator(`div:has(> span:text-is("${label}")) > span:last-child`);
  }

  async ref(): Promise<string> {
    return (await this.bookingRef.innerText()).trim();
  }

  async summary(): Promise<{ ref: string; customer: string; tickets: number; total: number }> {
    return {
      ref: await this.ref(),
      customer: (await this.value('Customer').innerText()).trim(),
      tickets: Number((await this.value('Tickets').innerText()).trim()),
      total: parseCurrency(await this.value('Total').innerText()),
    };
  }
}
