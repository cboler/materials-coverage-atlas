import { test, expect, type Page } from '@playwright/test';

// Property-profile axis labels must never collide or be cut off. At about 800 px the old fixed
// layout overlapped "Bulk modulus"/"Shear modulus" and clipped the last axis.
const WIDTHS = [
  { name: 'phone', width: 390, height: 844 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'narrow desktop', width: 800, height: 900 },
  { name: 'desktop', width: 1280, height: 800 },
];

interface Box {
  axis: number;
  text: string;
  left: number;
  right: number;
  top: number;
  bottom: number;
}

/** Every text box in the axes, relative to the plot's SVG, plus the SVG width. */
async function axisLabels(page: Page): Promise<{ width: number; boxes: Box[] }> {
  return page.evaluate(() => {
    const svg = document.querySelector('app-parallel-coordinates svg')!;
    const frame = svg.getBoundingClientRect();
    const boxes = [...svg.querySelectorAll('g.pc-axis')].flatMap((g, axis) =>
      [...g.querySelectorAll('text')].map((t) => {
        const b = t.getBoundingClientRect();
        return {
          axis,
          text: (t.firstChild?.textContent ?? t.textContent ?? '').trim(),
          left: b.left - frame.left,
          right: b.right - frame.left,
          top: b.top,
          bottom: b.bottom,
        };
      }),
    );
    return { width: frame.width, boxes };
  });
}

test.describe('Property-profile axes', () => {
  for (const vp of WIDTHS) {
    test(`labels neither overlap nor clip at ${vp.width}px (${vp.name})`, async ({ page }) => {
      // Each case sets its own viewport, so one project is enough.
      test.skip(test.info().project.name !== 'desktop', 'runs in the desktop project only');
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto('/');
      const axes = page.locator('app-parallel-coordinates g.pc-axis');
      test.skip((await page.locator('#atlas-missing').count()) > 0, 'no atlas data');
      await expect(axes).toHaveCount(9);

      const { width, boxes } = await axisLabels(page);
      expect(boxes.length).toBeGreaterThan(30);

      const clipped = boxes.filter((b) => b.left < -0.5 || b.right > width + 0.5);
      expect(clipped.map((b) => b.text)).toEqual([]);

      const overlaps: string[] = [];
      for (const a of boxes) {
        for (const b of boxes) {
          const separate =
            a.right <= b.left || b.right <= a.left || a.bottom <= b.top || b.bottom <= a.top;
          if (a.axis < b.axis && !separate) overlaps.push(`${a.text} / ${b.text}`);
        }
      }
      expect(overlaps).toEqual([]);

      // Titles stay in order left to right with clear space between them.
      const titles = await axes
        .locator('.pc-title')
        .evaluateAll((els) =>
          els.map((el) => el.getBoundingClientRect()).map((r) => [r.left, r.right]),
        );
      for (let k = 1; k < titles.length; k++) {
        expect(titles[k][0]).toBeGreaterThan(titles[k - 1][1]);
      }

      // The page itself never scrolls sideways; a too-narrow plot scrolls inside its own box.
      const pageOverflow = await page.evaluate(
        () => document.documentElement.scrollWidth > window.innerWidth,
      );
      expect(pageOverflow).toBe(false);
    });
  }
});
