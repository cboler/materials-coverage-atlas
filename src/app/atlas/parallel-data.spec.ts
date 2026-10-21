import { FIXTURE } from './atlas-fixture';
import { MISSING_T, UNPHYSICAL_T, axisPositions, buildAxes, filterMask } from './parallel-data';

const axes = buildAxes(FIXTURE);
const axis = (key: string) => axes.find((a) => a.key === key)!;

describe('buildAxes', () => {
  it('places category levels top to bottom with jittered ribbons inside each band', () => {
    const cat = axis('category');
    expect(cat.ticks.map((t) => t.label)).toEqual([
      'Structural',
      'Energy',
      'Electronic / optical',
      'Magnetic',
      'Unclassified',
    ]);
    // Al2O3 is structural (level 0): top band, 0.8..1.0.
    expect(cat.positions[0]).toBeGreaterThan(0.8);
    expect(cat.positions[0]).toBeLessThanOrEqual(1);
    expect(cat.hasMissing).toBe(false);
  });

  it('maps numeric values into [0, 1] and missing values into the no-data slot', () => {
    const k = axis('k_vrh');
    expect(k.hasMissing).toBe(true);
    expect(k.positions[0]).toBeCloseTo(232 / 500, 3); // fixed physical domain (0, 500] GPa
    expect(k.positions[2]).toBeLessThan(0); // GaAs has no elastic data
    expect(Math.abs(k.positions[2] - MISSING_T)).toBeLessThan(0.05);
  });

  it('sends physically impossible moduli to the unphysical slot', () => {
    const broken = structuredClone(FIXTURE);
    broken.columns.k_vrh = [-5, 4.7e11, null, null];
    const k = buildAxes(broken).find((a) => a.key === 'k_vrh')!;
    expect(k.hasUnphysical).toBe(true);
    expect(Math.abs(k.positions[0] - UNPHYSICAL_T)).toBeLessThan(0.05);
    expect(Math.abs(k.positions[1] - UNPHYSICAL_T)).toBeLessThan(0.05);
    expect(k.positions[2]).toBeLessThan(0);
  });

  it('uses decade ticks on log axes', () => {
    // Fixture costs span 0.4 .. 500k $/kg.
    const ticks = axis('cost').ticks;
    expect(ticks.map((t) => t.label)).toEqual(['1', '10', '100', '1k', '10k', '100k']);
    expect(ticks.every((t) => t.t >= 0 && t.t <= 1)).toBe(true);
  });
});

describe('filterMask', () => {
  it('returns null when nothing is brushed', () => {
    expect(filterMask(axes, new Map())).toBeNull();
  });

  it('ANDs brushes across axes', () => {
    // Anywhere on the bulk-modulus axis (i.e. has elastic data): Al2O3 and Fe.
    const stiff = filterMask(axes, new Map([['k_vrh', { lo: 0, hi: 1 }]]));
    expect([...stiff!]).toEqual([1, 1, 0, 0]);

    // ...that are also experimental (Origin level 0, upper band).
    const both = filterMask(
      axes,
      new Map([
        ['k_vrh', { lo: 0, hi: 1 }],
        ['theoretical', { lo: 0.5, hi: 1 }],
      ]),
    );
    expect([...both!]).toEqual([1, 0, 0, 0]);
  });

  it('selects the no-data slot when a brush covers it', () => {
    const missing = filterMask(axes, new Map([['k_vrh', { lo: MISSING_T - 0.05, hi: -0.02 }]]));
    expect([...missing!]).toEqual([0, 0, 1, 1]);
  });
});

describe('axisPositions', () => {
  const ext = (titleLeft: number, titleRight: number, bodyLeft: number, bodyRight: number) => ({
    titleLeft,
    titleRight,
    bodyLeft,
    bodyRight,
  });

  it('spaces neighbors by the wider of their title and body rows', () => {
    // Titles need 30 + 30, bodies 12 + 50; the larger (62) plus the gap wins.
    const { xs, width } = axisPositions([ext(30, 30, 12, 12), ext(30, 30, 50, 12)], 0, 4, 10);
    expect(xs).toEqual([34, 34 + 72]);
    expect(width).toBe(34 + 72 + 30 + 4);
  });

  it('shares spare width between the gaps and keeps the edges tight', () => {
    const { xs, width } = axisPositions(
      [ext(10, 10, 10, 10), ext(10, 10, 10, 10), ext(10, 10, 10, 10)],
      200,
      4,
      10,
    );
    expect(width).toBe(200);
    expect(xs[0]).toBe(14);
    expect(xs[2]).toBe(200 - 14);
    expect(xs[1] - xs[0]).toBeCloseTo(xs[2] - xs[1]);
  });

  it('grows past the available width instead of overlapping', () => {
    const axes = Array.from({ length: 9 }, () => ext(40, 40, 50, 12));
    const { xs, width } = axisPositions(axes, 300, 4, 10);
    expect(width).toBeGreaterThan(300);
    for (let k = 1; k < xs.length; k++) expect(xs[k] - xs[k - 1]).toBeGreaterThanOrEqual(90);
  });

  it('gives every axis a short title with the unit on a second line', () => {
    expect(axis('k_vrh').title).toEqual(['Bulk mod.', 'GPa']);
    expect(axis('category').title).toEqual(['Category']);
    expect(axes.every((a) => a.title[0].length <= 12)).toBe(true);
  });
});
