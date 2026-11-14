import type { APIRequestContext } from '@playwright/test';
import { AuthClient } from './clients/AuthClient';
import { BookingsClient } from './clients/BookingsClient';
import { EventsClient } from './clients/EventsClient';
import { ApiClient, type TokenProvider } from './core/ApiClient';
import type { ExchangeLog } from './core/ExchangeLog';

/**
 * Facade grouping all domain clients that share one transport, one auth identity and one exchange log.
 * Adding a new API area = add a client class + one line here; tests get it via the `api` fixture.
 */
export class EventHubApi {
  readonly auth: AuthClient;
  readonly events: EventsClient;
  readonly bookings: BookingsClient;

  constructor(request: APIRequestContext, log: ExchangeLog, tokens: TokenProvider | null) {
    const http = new ApiClient(request, log, tokens);
    this.auth = new AuthClient(http);
    this.events = new EventsClient(http);
    this.bookings = new BookingsClient(http);
  }
}
