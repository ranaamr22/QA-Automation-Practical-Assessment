import type { Locator, Page } from '@playwright/test';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { BasePage } from './BasePage';

type DetailLabel = 'Event' | 'Category' | 'Date' | 'Venue' | 'City' | 'Name' | 'Email' | 'Phone' | 'Tickets' | 'Price per ticket';

/** /bookings/{id} - read-only booking details and cancellation. */
export class BookingDetailsPage extends BasePage {
  protected path = '/bookings';
  readonly eventTitle: Locator;
  readonly totalPaid: Locator;
  readonly cancelButton: Locator;
  readonly notFound: Locator;
  readonly accessDenied: Locator;
  readonly dialog: ConfirmDialog;
  readonly breadcrumbMyBookings: Locator;
  readonly backToMyBookings: Locator;
  protected readonly readyIndicator: Locator;

  constructor(page: Page) {
    super(page);
    this.eventTitle = page.getByRole('heading', { level: 1 });
    this.totalPaid = page.locator('span:text-is("Total Paid") + span');
    this.cancelButton = page.getByRole('button', { name: 'Cancel Booking' });
    this.notFound = page.getByRole('heading', { name: 'Booking not found' });
    this.accessDenied = page.getByRole('heading', { name: 'Access Denied' });
    this.dialog = new ConfirmDialog(page);
    this.breadcrumbMyBookings = page.getByRole('main').getByRole('link', { name: 'My Bookings', exact: true }).first();
    this.backToMyBookings = page.getByRole('link', { name: '← Back to My Bookings' });
    this.readyIndicator = this.eventTitle.or(this.notFound).or(this.accessDenied);
  }

  async open(bookingId: number): Promise<this> {
    this.path = `/bookings/${bookingId}`;
    return this.goto();
  }

  value(label: DetailLabel): Locator {
    return this.page.locator(`div:has(> span:text-is("${label}")) > span:last-child`);
  }
}
