import type { Locator } from '@playwright/test';
import type { Customer } from '@src/data/customer.factory';

export type CustomerField = 'name' | 'email' | 'phone';

/**
 * Customer details section of the booking form.
 * Inputs are located by their visible <label> (properly associated via for/id in the app),
 * which also implicitly verifies the label association that screen readers rely on.
 *
 * Error messages are sibling <p> elements with NO programmatic link to the input (no aria-describedby,
 * no role="alert") - so the only way to reach them is structurally (`input + p`).
 */
export class CustomerForm {
  readonly name: Locator;
  readonly email: Locator;
  readonly phone: Locator;

  constructor(private readonly form: Locator) {
    this.name = form.getByLabel('Full Name');
    this.email = form.getByLabel('Email');
    this.phone = form.getByLabel('Phone Number');
  }

  field(field: CustomerField): Locator {
    return this[field];
  }

  error(field: CustomerField): Locator {
    const id = { name: 'customerName', email: 'customer-email', phone: 'phone' }[field];
    return this.form.locator(`#${id} + p`);
  }

  /** All currently visible validation messages in the form. */
  get errors(): Locator {
    return this.form.locator('p.text-red-600');
  }

  async fill(customer: Partial<Customer>): Promise<void> {
    if (customer.name !== undefined) await this.name.fill(customer.name);
    if (customer.email !== undefined) await this.email.fill(customer.email);
    if (customer.phone !== undefined) await this.phone.fill(customer.phone);
  }
}
