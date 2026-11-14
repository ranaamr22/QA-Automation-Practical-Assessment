# EventHub – QA Automation (US-114: Book tickets for an event)

UI and API test automation for the booking flow of **EventHub**, built with **Playwright + TypeScript**.

| | |
|---|---|
| Web app | https://eventhub.rahulshettyacademy.com |
| API | https://api.eventhub.rahulshettyacademy.com/api ([docs](https://api.eventhub.rahulshettyacademy.com/api/docs)) |
| Tests | **230** in 18 files: 85 UI · 141 API · 4 setup/cleanup |
| Last full run | 2026-11-14, local, 1 worker: **230 passed** (10 confirmed bugs run as expected failures) |

---

## 1. Scope

| AC | Story text | Automated in |
|---|---|---|
| AC1 | Choose tickets, enter name/e-mail/phone, *Confirm Booking* → confirmation with a booking reference | `tests/ui/booking/ac1-*` |
| AC2 | Total = ticket price × number of tickets | `tests/ui/booking/ac2-total-price` |
| AC3 | The booking appears in My Bookings | `tests/ui/booking/ac3-my-bookings` |
| AC4 | The booking can be cancelled | `tests/ui/booking/ac4-cancel-booking` |
| AC5 | Same behaviour via `POST /api/bookings` | `tests/api/*` + `tests/ui/booking/ac5-ui-api-consistency` |
| – | The steps chained as real user journeys | `tests/ui/booking/e2e-booking-journeys`, `tests/api/e2e-api-journeys` |

**Out of scope (chosen):** sign-in/registration UI and the `/auth` endpoints, event management,
the events search page, accessibility and responsive testing. Login is handled once, as infrastructure.
`POST/DELETE /events` are used **only as test setup** (e.g. an event with exactly 8 seats) and the events are deleted afterwards.

## 2. Technology stack

| Concern | Choice | Why |
|---|---|---|
| UI + API automation | Playwright Test + TypeScript | One runner, language and report for both layers. UI and API share the same login session, so UI↔API checks need no extra plumbing. A second toolchain (RestAssured/Java) would duplicate auth and data handling without adding coverage. |
| Configuration | dotenv | `.env` locally, secrets in CI; invalid configuration fails at start-up. |

## 3. Project structure

```
.github/workflows/e2e.yml   CI: static checks → api job | ui job
playwright.config.ts        projects: setup → api, ui → cleanup
src/
  config/      env.ts – typed, validated environment
  auth/        AuthSession (login, token refresh) · accounts (per-worker accounts) · storageState
  api/         core/ApiClient (auth, retry, redaction) · clients/ · models/ (zod) · EventHubApi facade
  data/        customer/booking/event factories · invalid-input tables · EventCatalog · cleanup trackers
  ui/          pages/ · components/ (QuantitySelector, CustomerForm, PriceSummary, BookingCard, …) · network.ts
  assertions/  api.assertions · seat.assertions · layout.assertions
  fixtures/    auth → api → data → index (import { test, expect } from '@src/fixtures')
  utils/       redact · money · jwt · logger
tests/
  setup/       preflight.setup.ts (config + health) · cleanup.teardown.ts (leftover sweep)
  api/         bookings.create · .validation · .read · .lifecycle · .availability · events.read · e2e-api-journeys
  ui/booking/  ac1-* · ac2-total-price · ac3-my-bookings · ac4-cancel-booking · ac5-ui-api-consistency · e2e-booking-journeys
```


## 4. Setup

Prerequisites: Node.js ≥ 20 (CI uses 22).

```bash
npm ci
npx playwright install --with-deps chromium   # needed for the ui project only
# create a .env file with your credentials (see section 5)
npx playwright test --workers=1
```

## 5. Credentials and environment variables

The tests need **one EventHub account**, configured in `.env`:

```
EVENTHUB_EMAIL=rana.qa.test01@gmail.com
EVENTHUB_PASSWORD=EventHub@QA2026!Test
```

- Any address works: if the login is rejected, the framework registers the account automatically.
  The password must meet the app rule (≥ 8 characters, upper-case letter, digit, symbol).
- In CI the same two values come from the repository secrets `EVENTHUB_EMAIL` and `EVENTHUB_PASSWORD`.
- Real credentials are never committed or logged: API exchanges are redacted before they reach logs or reports.

| Variable | Default | Purpose |
|---|---|---|
| `EVENTHUB_EMAIL` / `EVENTHUB_PASSWORD` | – (required) | Base account |
| `EVENTHUB_BASE_URL` / `EVENTHUB_API_URL` | production URLs | Target environment |
| `EVENTHUB_ACCOUNT_STRATEGY` | `per-worker` | `shared` = every worker uses the base account (run with `--workers=1`) |
| `EVENTHUB_ACCOUNT_NAMESPACE` | `local` | Keeps derived accounts of concurrent runs apart (CI: `ci-api`, `ci-ui`) |
| `DEBUG_API` | `0` | `1` prints every redacted API exchange |

## 6. Running the tests

> The tests create and cancel **real bookings** in the configured account and clean them up automatically.
> Locally use `--workers=1` so that only your own account is used.

```bash
npx playwright test --workers=1                        # everything
npm run test:api -- --workers=1                        # API suite, no browser
npm run test:ui -- --workers=1                         # UI suite
npm run test:e2e -- --workers=1                        # the 6 UI end-to-end journeys
npm run test:e2e:api -- --workers=1                    # the 5 API end-to-end journeys
npm run test:smoke -- --workers=1                      # @smoke tests of both layers
npx playwright test --workers=1 -g "E2E-01"            # a single test by ID
npx playwright test --project=ui --grep @ac2 --workers=1   # one acceptance criterion
npx playwright test --project=ui --headed --workers=1  # watch the browser
npm run report                                         # open the HTML report
```

On failure the report contains a trace, screenshot, video and `api-exchanges.json` (all HTTP calls of the test, redacted).
Journeys use `test.step`, so the report shows which step failed.

**CI** ([.github/workflows/e2e.yml](.github/workflows/e2e.yml)): static checks (`npm ci`, `tsc`, `--list`, secrets present)
→ `api` and `ui` jobs in separate account namespaces; 1 retry in CI only; the HTML report is always uploaded.
Without secrets (e.g. fork PRs) the test jobs are skipped with a warning.

## 7. Key design decisions

| Decision | Reason |
|---|---|
| **Login via API, token injected into the browser** (`localStorage.eventhub_token`) | Same mechanism as the app's own login; fast and stable; UI and API act as the same user. Token refresh and a single re-try on 401 are handled centrally. |
| **Layered fixtures, page objects built from components** | Explicit dependencies and teardown order; a markup change is fixed in one class. |
| **Locators:** role/label/text → `data-testid` → minimal CSS | No XPath. The few CSS hooks left are listed as test-id requests (section 11). |
| **Seat counts are asserted dynamically** (`src/assertions/seat.assertions.ts`) | Featured events are shared by every user of the public site, so their seat counters move during a run. Seat changes are measured with API reads immediately before and after the action; repeatable API checks retry with a fresh action if another user interfered; the event page is compared with the live API value. The assertions stay exact (−3 means −3). |
| **Layered testing** – one behaviour-per-AC test with preconditions provisioned through the API, complemented by UI-only journeys | A granular test failure identifies the specific feature at fault; a journey failure indicates which hand-off between steps failed. |
| **Traceable IDs and tags** – `[AC1-QTY-04]`, `@ac1 … @ac5 @e2e @smoke @negative @boundary @security @known-defect` | Every test maps to an AC; selective runs via `--grep`. |
| **Confirmed bugs as expected failures** (`test.fail()` + `@known-defect`) | The tests assert the correct behaviour; the suite stays green and a test turns red the day its bug is fixed. |

**Test data and cleanup:** events are chosen at runtime (`EventCatalog`, no hard-coded IDs) or created with exact
properties and deleted afterwards. Customer data is unique and uses `@example.com`; e-mails carry a run marker.
Each test cancels/deletes what it created, even on failure. The `cleanup` project then sweeps the framework's
accounts for suite-marked leftovers of this run and of earlier runs older than 60 minutes. Never touched:
other users' data, featured events, bookings not created by the suite, and the undocumented `DELETE /bookings` (clear-all) endpoint.

## 8. Coverage overview

**UI** (`tests/ui/booking`, 85 tests)

| Suite | IDs | Tests | What it proves |
|---|---|---|---|
| AC1 · Select an event | AC1-NAV-01…06 | 6 | Title and *Book Now* open the right event; low-seat badge; unknown event |
| AC1 · Ticket quantity | AC1-QTY-01…10 | 14 | 1–10 tickets, never more than seats left (8 seats → max 8, bookable); sold-out state |
| AC1 · Customer details | AC1-CUS-01…30 | 30 | Name/e-mail/phone validation, no request on invalid input, XSS shown as text; 12 bug-hunt cases |
| AC1 · Confirm booking | AC1-CNF-01…05 | 5 | Confirmation content, double click, network failure, seats taken meanwhile, refresh |
| AC2 · Total price | AC2-PRC-01…08 | 8 | Total = price × tickets for all quantities and prices |
| AC3 · My Bookings | AC3-MYB-01…10 | 10 | Listed with full details, navigation, 9-booking cap, empty state, other users' bookings hidden |
| AC4 · Cancel booking | AC4-CAN-01…04 | 4 | Confirmation dialog, dismiss keeps booking, only the selected one cancelled, seats released |
| AC5 · UI ↔ API | AC5-API-01…02 | 2 | A UI booking is stored identically in the API (and seats drop); an API booking shows in the UI |

**UI journeys** (`e2e-booking-journeys`): **E2E-01** home page → book 3 → seats drop on the event page → My Bookings →
details → cancel → seats restored · **E2E-02** fix validation errors, then exactly one booking · **E2E-03** 8-seat event:
book all 8 → sold out → cancel → bookable again · **E2E-04** two bookings, cancel one · **E2E-05** network drop, retry
without duplicate · **E2E-06** booking cancelled via API shows as no longer active.

**API** (`tests/api`, 141 tests)

| File | Tests | Covers |
|---|---|---|
| bookings.create | 9 | Confirmed booking, reference, total, 1/10 tickets, persisted, seats decremented, duplicates, past events |
| bookings.validation | 62 | Each field missing/invalid (shared tables with the UI), body shape, valid edge values, mass-assignment (`totalPrice`, `status`, `userId`) ignored |
| bookings.read | 28 | Filters, pagination, defaults, invalid queries/ids, look-up by reference, malicious references |
| bookings.lifecycle | 13 | Cancel, seats released (incl. 10), double cancel, invalid ids, re-booking |
| bookings.availability | 3 | Never more tickets than seats (8 seats vs max 10) |
| events.read | 21 | Search/category/city filters, pagination, event details, invalid input |
| e2e-api-journeys | 5 | Full lifecycle; sell-out and re-open; **two buyers racing for the last seats** (no over-selling); mistake then booking; two events independent |

## 9. Story review

**Gaps in the story:** the actor is a "visitor", yet every page and endpoint requires login · AC1 leaves ticket
limits, field rules and failure behaviour undefined· AC4 leaves confirmation and seat release on cancel undefined · AC5 defines no error contract,
idempotency or "same validation as the UI" rule · accessibility and responsive behaviour are not specified at all.

**Refined acceptance criteria**

*Automated:*
- **AC1 — Select & quantity:** A logged-in user books **1–10 tickets, never more than the seats left** (max = min(10, seats remaining)). Name (≥ 2 characters, trimmed), a valid e-mail and a phone of ≥ 10 digits are required; invalid input sends no request, the *Confirm Booking* button cannot double-submit, and a failed request shows an error while keeping the entered data. The confirmation shows reference, name, tickets and total.
- **AC2 — Price:** The **single-ticket price is shown to the right of the "Book Tickets" title and does not change with quantity**; total = unit price × tickets, updated immediately; the API charges the exact amount.
- **AC3 — My Bookings:** The booking is listed with reference, event, tickets, total and status; its details are reachable; only the user's own bookings are visible.
- **AC4 — Cancel:** A booking is cancelled only after explicit confirmation; afterwards it is no longer active and its seats are released.
- **AC5 — UI ↔ API parity:** A UI booking is stored identically via the API and vice-versa, and the API enforces the booking rules itself.

*Proposed (not yet automated — see §1 out of scope):*
- **AC6 — Accessibility:** The booking flow passes basic a11y checks: controls have accessible names, inputs are linked to their error messages, element ids are unique, and the flow is fully keyboard-operable.
- **AC7 — Responsive:** The booking flow is usable across mobile, tablet and desktop viewports.

**Questions for the Product Owner**
1. **Name rule:** min/max length, is trimming applied, and are digits-only or symbols-only names allowed?
2. **E-mail rule:** which formats are valid or rejected (e.g. consecutive dots, trailing dot, sub-domains)?
3. **Phone rule:** country-specific or "≥ 10 digits"? Is there a maximum length, and are separators/letters allowed?
4. **Max bookings per user:** is there a limit on how many bookings a user can hold, and if the limit is reached, how should the system respond?
5. **Limited seats:** when a user requests more tickets than remain, what is the expected behaviour — cap silently, block the request, or show a message?

**Assumptions:** the actor is a logged-in user · the UI's validation rules are assumed to be the intended behaviour where the story is silent · 5xx responses are treated as environment issues unless reproducible (then reported below).

## 10. Confirmed bugs and discrepancies

Found on 2026-11-14. Each bug has tests that assert the expected behaviour and are marked as expected failures.

| ID | Severity | Bug | Example | Expected → actual |
|---|---|---|---|---|
| BUG-01 | High | Phone has no maximum length (UI and API) | `98765432101234567890` (20 digits) | Rejected → booking created (API also accepts 11 and 100 digits) |
| BUG-02 | Medium | UI accepts letters/separators in the phone if ≥ 10 digits remain | `98765abcde43210` | Field error → request sent; the API then rejects letters, so the user only sees a generic toast |
| BUG-03 | Medium | Name length counted before trimming | ` A` | Rejected → 1-character name stored |
| BUG-04 | Low | Digits-only / symbols-only names accepted (UI and API) | `12345`, `!@#$%` | Rejected (to confirm with PO) → accepted |
| BUG-05 | Low | Malformed e-mails accepted | `a@example..com`, `a@example.com.` | Rejected → accepted |
| BUG-06 | Medium | API converts wrong JSON types instead of rejecting them | `"quantity":"2"`, `"customerName":{…}` | 400 → 201; an object name is stored as `"[object Object]"` |
| BUG-07 | Medium | Bad request bodies cause a server error | broken JSON, array values, 256-character name | 400 → 500 |
| BUG-08 | Medium | Invalid ids / query values cause a server error | `GET /bookings/abc`, `DELETE /bookings/not-a-number`, `?page=-1` | 400/404 → 500 |
| BUG-09 | Low | Documented page-size limit 1–100 not enforced | `?limit=101`, `?limit=-5` | Rejected or clamped → used as sent |
| BUG-10 | Medium | Past events can be booked | event dated 2026-10-20 | 400 → 201 (while `POST /events` refuses past dates) |

## 11. Limitations and next steps

**Limitations**
- Chromium on a desktop viewport only.
- Shared public environment: featured events are changed by other users at any time. Seat assertions are measured
  immediately around each action (section 7), but another user's booking within that ~1-second window can still cause
  a rare failure (in CI it is absorbed by the single retry).

**With more time**
1. Extend coverage to adjacent flows — login/registration, event creation and cancellation, and similar journeys.
2. Add accessibility checks and responsive-layout checks across mobile, tablet and desktop viewports.
3. Produce a richer, more informative output report.
