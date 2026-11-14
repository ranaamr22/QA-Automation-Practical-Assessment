import type { Locator, Page } from '@playwright/test';
import type { Customer } from '@src/data/customer.factory';
import { parseCurrency } from '@src/utils/money';
import { BookingConfirmation } from '../components/BookingConfirmation';
import { CustomerForm } from '../components/CustomerForm';
import { PriceSummary } from '../components/PriceSummary';
import { QuantitySelector } from '../components/QuantitySelector';
import { BasePage } from './BasePage';

/**
 * /events/{id} - event details + "Book Tickets" panel (the core of US-114).
 * Composed from components so each concern (quantity, customer data, pricing, confirmation)
 * can be reused and changed independently.
 */
export class EventBookingPage extends BasePage {
  protected path = '/events';
  readonly eventTitle: Locator;
  readonly bookTicketsHeading: Locator;
  /** Single-ticket price rendered next to the "Book Tickets" heading (AC2). */
  readonly unitPrice: Locator;
  readonly pricePerTicketDetail: Locator;
  readonly form: Locator;
  readonly confirmButton: Locator;
  readonly quantity: QuantitySelector;
  readonly customer: CustomerForm;
  readonly summary: PriceSummary;
  readonly confirmation: BookingConfirmation;
  readonly notFoundHeading: Locator;
  /** "Available" detail tile: "47 / 10000 seats" or "SOLD OUT". */
  readonly availability: Locator;
  protected readonly readyIndicator: Locator;

  constructor(page: Page) {
    super(page);
    this.eventTitle = page.getByRole('heading', { level: 1 });
    this.bookTicketsHeading = page.getByRole('heading', { name: 'Book Tickets', level: 2 });
    this.unitPrice = page.locator('h2:text-is("Book Tickets") + span');
    this.pricePerTicketDetail = page.locator('p:text-is("Price per ticket") + p');
    this.confirmButton = page.getByRole('button', { name: /^(Confirm Booking|Sold Out)$/ });
    this.form = page.locator('form').filter({ has: this.confirmButton });
    this.quantity = new QuantitySelector(this.form);
    this.customer = new CustomerForm(this.form);
    this.summary = new PriceSummary(this.form);
    this.confirmation = new BookingConfirmation(page);
    this.notFoundHeading = page.getByRole('heading', { name: 'Event not found' });
    this.availability = page.locator('p:text-is("Available") + p');
    this.readyIndicator = this.bookTicketsHeading.or(this.notFoundHeading);
  }

  async open(eventId: number | string): Promise<this> {
    this.path = `/events/${eventId}`;
    return this.goto();
  }

  /** Current event id taken from the URL - the source of truth for "navigated to the correct event". */
  eventIdFromUrl(): number {
    const match = new URL(this.page.url()).pathname.match(/^\/events\/(\d+)$/);
    if (!match) throw new Error(`Not on an event page: ${this.page.url()}`);
    return Number(match[1]);
  }

  async unitPriceValue(): Promise<number> {
    return parseCurrency(await this.unitPrice.innerText());
  }

  /** Parses "47 / 10000 seats" -> { available: 47, total: 10000 }; SOLD OUT -> available 0. */
  async seats(): Promise<{ available: number; total?: number }> {
    const text = (await this.availability.innerText()).trim();
    if (/sold out/i.test(text)) return { available: 0 };
    const match = text.match(/(\d+)\s*\/\s*(\d+)/);
    if (!match) throw new Error(`Cannot parse availability "${text}"`);
    return { available: Number(match[1]), total: Number(match[2]) };
  }

  async fillAndConfirm(customer: Customer, quantity: number): Promise<void> {
    await this.quantity.setTo(quantity);
    await this.customer.fill(customer);
    await this.confirmButton.click();
  }

  /**
   * Full happy path; resolves with the booking reference shown to the user.
   * The caller is responsible for tracking the ref for cleanup (fixture `bookingTracker`).
   */
  async book(customer: Customer, quantity: number): Promise<string> {
    await this.fillAndConfirm(customer, quantity);
    await this.confirmation.heading.waitFor();
    return this.confirmation.ref();
  }
}
