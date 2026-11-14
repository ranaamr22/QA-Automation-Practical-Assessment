import { buildCustomer } from '@src/data/customer.factory';
import { expect, test } from '@src/fixtures';
import type { CustomerField } from '@src/ui/components/CustomerForm';
import { BOOKING_CREATE_ROUTE, RequestRecorder } from '@src/ui/network';

/**
 * US-114 · AC1 - "... enter my name, email and phone ..."
 *
 * Invalid input must never reach the API: every negative test also proves that NO POST /bookings was sent.
 * Messages are the app's own copy (production bundle) and asserted verbatim on purpose.
 */
const MESSAGES: Record<CustomerField, string> = {
  name: 'Name must be at least 2 chars',
  email: 'Enter a valid email',
  phone: 'Enter a valid 10-digit phone',
};

test.describe('US-114 · AC1 · Customer details', { tag: ['@ui', '@ac1', '@validation'] }, () => {
  test.describe('invalid input is blocked', () => {
    let bookingRequests: RequestRecorder;

    test.beforeEach(async ({ eventPage, bookableEvent, page }) => {
      bookingRequests = RequestRecorder.bookingCreation(page);
      // Safety net: if validation lets invalid data through (a bug), the request is recorded but never
      // reaches the server - so a failing negative test cannot create a real booking with bad data.
      await page.route(BOOKING_CREATE_ROUTE, (route) =>
        route.request().method() === 'POST' ? route.abort('blockedbyclient') : route.continue(),
      );
      await eventPage.open(bookableEvent.id);
    });

    test.afterEach(async ({ eventPage }) => {
      expect(bookingRequests.count, 'invalid input must not send POST /bookings').toBe(0);
      await expect(eventPage.confirmation.heading).toBeHidden();
    });

    test('[AC1-CUS-01] shows a message for every mandatory field when all are empty', { tag: '@smoke' }, async ({ eventPage }) => {
      await eventPage.confirmButton.click();
      for (const field of Object.keys(MESSAGES) as CustomerField[]) {
        await expect(eventPage.customer.error(field)).toHaveText(MESSAGES[field]);
      }
    });

    for (const [i, missing] of (['name', 'email', 'phone'] as CustomerField[]).entries()) {
      test(`[AC1-CUS-0${i + 2}] shows only the ${missing} message when ${missing} is missing`, async ({ eventPage }) => {
        await eventPage.customer.fill({ ...buildCustomer(), [missing]: '' });
        await eventPage.confirmButton.click();
        await expect(eventPage.customer.error(missing)).toHaveText(MESSAGES[missing]);
        await expect(eventPage.customer.errors).toHaveCount(1);
      });
    }

    for (const [i, email] of ['qa.tester.example.com', 'qa.tester@', 'qa.tester@example', 'qa tester@example.com'].entries()) {
      test(`[AC1-CUS-0${i + 5}] rejects the invalid email "${email}"`, async ({ eventPage }) => {
        await eventPage.customer.fill(buildCustomer({ email }));
        await eventPage.confirmButton.click();
        await expect(eventPage.customer.error('email')).toHaveText(MESSAGES.email);
      });
    }

    // UI rule: at least 10 digits once formatting characters are removed.
    for (const [i, phone] of ['987654321', 'abcdefghij', '+91 98765'].entries()) {
      test(`[AC1-CUS-${String(i + 9).padStart(2, '0')}] rejects the invalid phone "${phone}"`, async ({ eventPage }) => {
        await eventPage.customer.fill(buildCustomer({ phone }));
        await eventPage.confirmButton.click();
        await expect(eventPage.customer.error('phone')).toHaveText(MESSAGES.phone);
      });
    }

    test('[AC1-CUS-12] rejects a one-character name', { tag: '@boundary' }, async ({ eventPage }) => {
      await eventPage.customer.fill(buildCustomer({ name: 'A' }));
      await eventPage.confirmButton.click();
      await expect(eventPage.customer.error('name')).toHaveText(MESSAGES.name);
    });

    test('[AC1-CUS-13] marks name, email and phone as mandatory ("*" and required)', async ({ eventPage }) => {
      for (const field of ['name', 'email', 'phone'] as CustomerField[]) {
        await expect(eventPage.customer.field(field)).toHaveAttribute('required', '');
      }
      await expect(eventPage.form.locator('label span.text-red-500', { hasText: '*' })).toHaveCount(3);
    });

    /**
     * Rule gaps found in the app's validation code (production bundle):
     *   phone: digits.length >= 10  -> no upper limit, letters are silently stripped
     *   name:  !trim() || length < 2 -> length is measured BEFORE trimming
     *   email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/ -> accepts empty labels / consecutive dots
     * Expected behaviour comes from the app's own message ("Enter a valid 10-digit phone"), E.164
     * (max 15 digits) and RFC 5321/5322 basics.
     */
    const RULE_GAPS: Array<{ id: string; field: CustomerField; value: string; why: string; bug: string }> = [
      { id: '19', field: 'phone', value: '98765432101', why: '11 digits - message demands a 10-digit phone', bug: 'BUG-01' },
      { id: '20', field: 'phone', value: '987654321012345', why: '15 digits, no country code', bug: 'BUG-01' },
      { id: '21', field: 'phone', value: '98765432101234567890', why: '20 digits - longer than any phone number (E.164 max 15)', bug: 'BUG-01' },
      { id: '22', field: 'phone', value: '98765abcde43210', why: 'letters inside the number', bug: 'BUG-02' },
      { id: '23', field: 'phone', value: '9-8-7-6-5-4-3-2-1-0', why: 'digits separated by dashes everywhere', bug: 'BUG-02' },
      { id: '24', field: 'name', value: ' A', why: 'only one real character (leading space counted)', bug: 'BUG-03' },
      { id: '25', field: 'name', value: '12345', why: 'digits only', bug: 'BUG-04' },
      { id: '26', field: 'name', value: '!@#$%', why: 'symbols only', bug: 'BUG-04' },
      { id: '27', field: 'email', value: 'qa.tester@example..com', why: 'consecutive dots in the domain', bug: 'BUG-05' },
      { id: '28', field: 'email', value: 'qa..tester@example.com', why: 'consecutive dots in the local part', bug: 'BUG-05' },
      { id: '29', field: 'email', value: 'qa.tester@.example.com', why: 'domain starts with a dot', bug: 'BUG-05' },
      { id: '30', field: 'email', value: 'qa.tester@example.com.', why: 'trailing dot', bug: 'BUG-05' },
    ];
    for (const { id, field, value, why, bug } of RULE_GAPS) {
      test(`[AC1-CUS-${id}] rejects the ${field} "${value}" (${why})`, { tag: ['@negative', '@known-defect'] }, async ({ eventPage }) => {
        // an unexpected pass means the bug was fixed -> remove this line.
        test.fail(true, `${bug}: ${field} "${value}" is accepted`);
        await eventPage.customer.fill(buildCustomer({ [field]: value }));
        await eventPage.confirmButton.click();
        await expect(eventPage.customer.error(field)).toHaveText(MESSAGES[field], { timeout: 3_000 });
      });
    }
  });

  test.describe('valid input is accepted and kept exactly', () => {
    test('[AC1-CUS-14] keeps names with accents, apostrophes and hyphens exactly', async ({
      bookableEvent,
      eventPage,
      bookingDetailsPage,
      api,
      bookingTracker,
    }) => {
      const customer = buildCustomer({ name: "Zoë O'Brien-Núñez" });
      await eventPage.open(bookableEvent.id);
      const ref = await eventPage.book(customer, 1);
      bookingTracker.trackRef(ref);

      await expect(eventPage.confirmation.value('Customer')).toHaveText(customer.name);
      const booking = await api.bookings.findByRef(ref);
      expect(booking!.customerName).toBe(customer.name);
      await bookingDetailsPage.open(booking!.id);
      await expect(bookingDetailsPage.value('Name')).toHaveText(customer.name);
    });

    test('[AC1-CUS-15] renders HTML/script in the name as plain text (no injection)', { tag: '@security' }, async ({
      bookableEvent,
      eventPage,
      bookingDetailsPage,
      api,
      bookingTracker,
      page,
    }) => {
      let dialogOpened = false;
      page.on('dialog', async (d) => {
        dialogOpened = true;
        await d.dismiss();
      });
      const payload = '<img src=x onerror=alert(1)><b>QA</b>';
      await eventPage.open(bookableEvent.id);
      const ref = await eventPage.book(buildCustomer({ name: payload }), 1);
      bookingTracker.trackRef(ref);

      await expect(eventPage.confirmation.value('Customer')).toHaveText(payload);
      const booking = await api.bookings.findByRef(ref);
      await bookingDetailsPage.open(booking!.id);
      await expect(bookingDetailsPage.value('Name')).toHaveText(payload);
      await expect(page.locator('img[src="x"]')).toHaveCount(0);
      expect(dialogOpened, 'no script may execute').toBe(false);
    });

    for (const [i, phone] of ['+91 98765 43210', '+91-9876543210', '(987) 654-3210'].entries()) {
      test(`[AC1-CUS-${16 + i}] accepts the formatted phone "${phone}" and stores it as entered`, async ({
        bookableEvent,
        eventPage,
        api,
        bookingTracker,
      }) => {
        await eventPage.open(bookableEvent.id);
        const ref = await eventPage.book(buildCustomer({ phone }), 1);
        bookingTracker.trackRef(ref);
        expect((await api.bookings.findByRef(ref))!.customerPhone).toBe(phone);
      });
    }
  });
});
