import type { Locator, Page } from '@playwright/test';
import { EventCard } from '../components/EventCard';
import { BasePage } from './BasePage';

export class HomePage extends BasePage {
  protected readonly path = '/';
  readonly featuredHeading: Locator;
  readonly eventCards: Locator;
  protected readonly readyIndicator: Locator;

  constructor(page: Page) {
    super(page);
    this.featuredHeading = page.getByRole('heading', { name: 'Featured Events' });
    this.eventCards = page.getByTestId('event-card');
    this.readyIndicator = this.eventCards.first();
  }

  card(index: number): EventCard {
    return new EventCard(this.eventCards.nth(index));
  }

  cardByTitle(title: string): EventCard {
    return new EventCard(this.eventCards.filter({ has: this.page.getByRole('heading', { name: title, exact: true }) }));
  }

  /** First card that can actually be booked (not "Sold Out"). */
  firstBookableCard(): EventCard {
    return new EventCard(
      this.eventCards.filter({ has: this.page.getByRole('link', { name: 'Book Now', exact: true }) }).first(),
    );
  }
}
