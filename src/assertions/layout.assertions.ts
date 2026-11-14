import { expect, type Locator } from '@playwright/test';

/** Geometry check used for "the single-ticket price appears to the right of the Book Tickets heading". */
async function box(locator: Locator, name: string) {
  await expect(locator, `${name} should be visible`).toBeVisible();
  const b = await locator.boundingBox();
  if (!b) throw new Error(`${name} has no bounding box`);
  return b;
}

/** `right` is on the same visual row as `left` and positioned to its right. */
export async function expectRightOfOnSameRow(left: Locator, leftName: string, right: Locator, rightName: string): Promise<void> {
  const [l, r] = [await box(left, leftName), await box(right, rightName)];
  expect(r.x, `${rightName} should be to the right of ${leftName}`).toBeGreaterThanOrEqual(l.x + l.width);
  const verticalOverlap = Math.min(l.y + l.height, r.y + r.height) - Math.max(l.y, r.y);
  expect(verticalOverlap, `${rightName} should be on the same row as ${leftName}`).toBeGreaterThan(0);
}
