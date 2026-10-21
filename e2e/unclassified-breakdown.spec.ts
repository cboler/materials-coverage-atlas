import { test, expect } from '@playwright/test';

// The Unclassified row opens a breakdown of why those materials fit no rule; clicking a bar
// highlights that group on the map, and the map note clears it.
test('why-unclassified bars highlight their materials on the map', async ({ page }) => {
  await page.goto('/');
  test.skip((await page.locator('#atlas-missing').count()) > 0, 'no atlas data');
  await expect(page.locator('#coverage-title')).toBeVisible(); // data loaded
  const toggle = page.locator('#reasons-toggle');
  test.skip((await toggle.count()) === 0, 'atlas file has no unclassified reasons');

  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  const bars = page.locator('#reasons-row .reason');
  await expect(bars).toHaveCount(6);

  // Counts add up to the Unclassified row.
  const num = (s: string) => Number(s.replace(/[^\d]/g, ''));
  const row = page.locator('tbody tr', { has: page.locator('#reasons-toggle') });
  const total = num((await row.locator('td').first().textContent())!);
  const counts = await page.locator('#reasons-row .reason-count').allTextContents();
  expect(counts.reduce((sum, c) => sum + num(c.split('·')[0]), 0)).toBe(total);

  // Every bar fits inside the visible table, even where the table scrolls sideways on phones.
  const wrap = (await page.locator('.table-wrap').boundingBox())!;
  for (const box of await bars.evaluateAll((els) => els.map((e) => e.getBoundingClientRect()))) {
    expect(box.right).toBeLessThanOrEqual(wrap.x + wrap.width + 1);
  }

  const first = page.locator('#reason-needs_stiffness');
  await first.click();
  await expect(first).toHaveAttribute('aria-pressed', 'true');
  const note = page.locator('#reason-note');
  await expect(note).toContainText('highlighted: One stiffness calculation away');
  await expect(note).toBeInViewport();

  await note.getByRole('button', { name: 'Clear' }).click();
  await expect(note).toHaveCount(0);
  await expect(first).toHaveAttribute('aria-pressed', 'false');
});
