import { Atlas } from './atlas-data';
import { FIXTURE } from './atlas-fixture';
import { chemicalFamily, findRegions, parseElements } from './map-regions';

describe('parseElements', () => {
  it('extracts unique element symbols from MP formulas', () => {
    expect(parseElements('Ca3Al2(HO)12')).toEqual(['Ca', 'Al', 'H', 'O']);
    expect(parseElements('Fe')).toEqual(['Fe']);
  });
});

describe('chemicalFamily', () => {
  const family = (formula: string) => chemicalFamily(new Set(parseElements(formula)));

  it('names oxygen families by their framework element', () => {
    expect(family('Ca2SiO4')).toBe('silicates');
    expect(family('LiFePO4')).toBe('phosphates');
    expect(family('CaSO4')).toBe('sulfates');
    expect(family('CaCO3')).toBe('carbonates');
    expect(family('Al2O3')).toBe('oxides');
  });

  it('puts organic-ligand compounds ahead of their anions', () => {
    expect(family('CH6NPbI3')).toBe('metal–organics'); // methylammonium lead iodide
  });

  it('covers oxygen-free families and metals', () => {
    expect(family('NaCl')).toBe('halides');
    expect(family('MoS2')).toBe('chalcogenides');
    expect(family('GaN')).toBe('nitrides');
    expect(family('Fe')).toBe('elements');
    expect(family('Fe3Ni')).toBe('intermetallics');
  });
});

describe('findRegions', () => {
  /** Two dense, well-separated islands: one of Li-Fe phosphates, one of Ni-Al intermetallics. */
  function twoIslands(): Atlas {
    const atlas = structuredClone(FIXTURE);
    const c = atlas.columns;
    for (const key of Object.keys(c) as (keyof typeof c)[]) (c[key] as unknown[]).length = 0;
    const add = (x: number, y: number, formula: string) => {
      c.x.push(x);
      c.y.push(y);
      c.formula.push(formula);
      c.id.push(`mp-${c.id.length}`);
    };
    for (let k = 0; k < 400; k++) {
      add(1000 + (k % 20) * 10, 1000 + Math.floor(k / 20) * 10, k % 2 ? 'LiFePO4' : 'Li2FeP2O7');
      add(8000 + (k % 20) * 10, 6000 + Math.floor(k / 20) * 10, k % 2 ? 'Ni3Al' : 'NiAl');
    }
    return atlas;
  }

  it('finds separate islands and names them by distinctive elements and dominant family', () => {
    const regions = findRegions(twoIslands());
    expect(regions).toHaveLength(2);
    const labels = regions.map((r) => r.label).sort();
    expect(labels).toEqual(['Li–Fe phosphates', 'Ni–Al intermetallics']);
    for (const r of regions) {
      expect(r.size).toBe(400);
      expect(r.familyShare).toBe(1);
    }
  });

  it('places each label inside its island', () => {
    const [a, b] = findRegions(twoIslands()).sort((p, q) => p.x - q.x);
    expect(a.x).toBeGreaterThanOrEqual(1000);
    expect(a.x).toBeLessThanOrEqual(1200);
    expect(b.y).toBeGreaterThanOrEqual(6000);
    expect(b.y).toBeLessThanOrEqual(6200);
  });
});
