import type { Locator, Page } from '@playwright/test';
import { EventCard } from '../components/EventCard';
import { BasePage } from './BasePage';

/** /events - browsable list; filters are applied through the URL (e.g. ?search=title). */
export class EventsListPage extends BasePage {
  protected path = '/events';
  readonly heading: Locator;
  readonly eventCards: Locator;
  protected readonly readyIndicator: Locator;

  constructor(page: Page) {
    super(page);
    this.heading = page.getByRole('heading', { name: 'Upcoming Events', level: 1 });
    this.eventCards = page.getByTestId('event-card');
    this.readyIndicator = this.heading;
  }

  async open(query: Record<string, string> = {}): Promise<this> {
    const qs = new URLSearchParams(query).toString();
    this.path = qs ? `/events?${qs}` : '/events';
    return this.goto();
  }

  cardByTitle(title: string): EventCard {
    return new EventCard(this.eventCards.filter({ has: this.page.getByRole('heading', { name: title, exact: true }) }));
  }
}
