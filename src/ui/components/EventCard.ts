import type { Locator } from '@playwright/test';
import { parseCurrency } from '@src/utils/money';

/**
 * One event tile (home page "Featured Events" and /events list share the same component in the app).
 * Root is located via the app's `data-testid="event-card"`; inner elements via accessible roles.
 * Note: the app ALSO renders `id="event-card"` / `id="book-now-btn"` on every card - duplicate DOM ids
 * (a11y/HTML defect, see README). Locators here never rely on those ids.
 */
export class EventCard {
  readonly title: Locator;
  readonly titleLink: Locator;
  readonly bookNowLink: Locator;
  readonly price: Locator;
  /** Low-availability badge, e.g. "8 seats left!" (shown when <= 10 seats remain). */
  readonly seatsLeftBadge: Locator;
  readonly soldOutBadge: Locator;

  constructor(readonly root: Locator) {
    this.seatsLeftBadge = root.getByText(/^\d+ seats? left!$/);
    this.soldOutBadge = root.getByText('SOLD OUT', { exact: true }).first();
    this.title = root.getByRole('heading', { level: 3 });
    // `has` is evaluated relative to each link, so it needs an unscoped locator (not root-chained).
    this.titleLink = root.getByRole('link').filter({ has: root.page().getByRole('heading', { level: 3 }) });
    this.bookNowLink = root.getByRole('link', { name: /^(book now|sold out)$/i });
    // Rendered as <p>$300</p> (verified 2026-11-14).
    this.price = root.getByText(/^\$[\d,.]+$/).first();
  }

  async titleText(): Promise<string> {
    return (await this.title.innerText()).trim();
  }

  async priceValue(): Promise<number> {
    return parseCurrency(await this.price.innerText());
  }

  /** Event id parsed from the link target (`/events/{id}`) - used to assert navigation lands on the right event. */
  async eventId(): Promise<number> {
    const href = await this.bookNowLink.getAttribute('href');
    const match = href?.match(/\/events\/(\d+)/);
    if (!match) throw new Error(`Cannot parse event id from Book Now href "${href}"`);
    return Number(match[1]);
  }
}
