import { test, expect } from '@playwright/test';

// The hover summary follows the pointer and can't be clicked, so links live in a card that is
// pinned by clicking a dot and stays open until closed.
test('clicking a dot pins a card whose links stay reachable', async ({ page }) => {
  await page.goto('/');
  test.skip((await page.locator('#atlas-missing').count()) > 0, 'no atlas data');
  await expect(page.locator('.legend-item').first()).toBeVisible();

  // Click the map at the iron landmark's ring.
  const ring = page.locator('svg.overlay-layer g.anchor', { hasText: 'Iron' }).locator('circle');
  await ring.scrollIntoViewIfNeeded();
  const box = (await ring.boundingBox())!;
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await expect(page.locator('.tooltip .hint')).toHaveText('Click the dot to pin it, with links');
  const hovered = (await page.locator('.tooltip strong').textContent())!.trim();
  await page.mouse.click(x, y);

  const card = page.locator('#pinned-card');
  await expect(card).toBeVisible();
  // The click pins the dot the hover summary showed, not a sub-pixel neighbor (Fe3Co, ...).
  await expect(card.locator('strong')).toHaveText(hovered);
  // While the selected dot is under the pointer, its hover summary would only cover the card.
  await expect(page.locator('.tooltip')).toHaveCount(0);

  // Moving the pointer away (as you would to reach a link) keeps the card open.
  await page.mouse.move(x + 200, y + 200);
  await page.mouse.move(x + 20, y + 20);
  await expect(card).toBeVisible();
  const link = card.getByRole('link', { name: /on Materials Project/ });
  await expect(link).toHaveAttribute('href', /materialsproject\.org\/materials\/mp-/);
  await link.click({ trial: true }); // actionable: visible, stable and not covered
  // The map clips overflow, so the whole card must sit inside it (phones are only ~350 px wide).
  const plot = (await page.locator('.plot').boundingBox())!;
  const cardBox = (await card.boundingBox())!;
  expect(cardBox.x).toBeGreaterThanOrEqual(plot.x);
  expect(cardBox.y).toBeGreaterThanOrEqual(plot.y);
  expect(cardBox.x + cardBox.width).toBeLessThanOrEqual(plot.x + plot.width);
  expect(cardBox.y + cardBox.height).toBeLessThanOrEqual(plot.y + plot.height);

  // "All details" jumps to the full card; × and Esc close the pinned one.
  await card.getByRole('button', { name: 'All details' }).click();
  await expect(page.locator('#selected-detail')).toBeInViewport();
  await card.getByRole('button', { name: 'Close' }).click();
  await expect(card).toHaveCount(0);

  await page.locator('.anchor-list button', { hasText: 'Iron' }).click();
  await expect(card).toBeVisible();
  await card.getByRole('button', { name: 'Close' }).focus();
  await page.keyboard.press('Escape');
  await expect(card).toHaveCount(0);
});
