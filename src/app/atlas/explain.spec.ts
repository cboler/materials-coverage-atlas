import {
  TERMS,
  describeGap,
  describeOrigin,
  describeStability,
  describeStiffness,
} from './explain';

describe('plain-language descriptions', () => {
  it('reads band gaps as conductor, semiconductor or insulator', () => {
    expect(describeGap(0)).toBe('conducts like a metal');
    expect(describeGap(1.4)).toBe('semiconductor');
    expect(describeGap(5.9)).toBe('insulator');
    expect(describeGap(null)).toBe('unknown');
  });

  it('reads energy above hull as stability', () => {
    expect(describeStability(0)).toBe('most stable form');
    expect(describeStability(0.03)).toBe('likely makeable');
    expect(describeStability(0.08)).toBe('borderline');
    expect(describeStability(0.4)).toBe('unstable: would tend to decompose');
  });

  it('compares shear stiffness with familiar metals and flags broken values', () => {
    expect(describeStiffness(null)).toBe('not computed');
    expect(describeStiffness(15)).toBe('softer than aluminum');
    expect(describeStiffness(44)).toBe('between aluminum and steel');
    expect(describeStiffness(147)).toBe('stiffer than steel');
    expect(describeStiffness(-14)).toBe('unphysical value (calculation problem)');
  });

  it('names origin in everyday terms', () => {
    expect(describeOrigin(false)).toBe('Made in a lab');
    expect(describeOrigin(true)).toBe('Predicted only');
  });

  it('defines every property the atlas shows', () => {
    for (const key of [
      'band_gap',
      'e_above_hull',
      'k_vrh',
      'g_vrh',
      'cost',
      'abundance',
    ] as const) {
      expect(TERMS[key].text.length).toBeGreaterThan(40);
    }
  });
});
