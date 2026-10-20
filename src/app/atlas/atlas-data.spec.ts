import {
  buildGroups,
  coverageRows,
  fmtNumber,
  materialDetail,
  similarMaterials,
} from './atlas-data';
import { FIXTURE } from './atlas-fixture';

describe('buildGroups', () => {
  it('groups by primary category in legend order', () => {
    const groups = buildGroups(FIXTURE, 'category');
    expect(groups.map((g) => g.key)).toEqual(FIXTURE.meta.categories);
    expect(groups.map((g) => g.indices)).toEqual([[0], [2], [], [1], [3]]);
  });

  it('splits experimental vs theoretical and elastic coverage', () => {
    expect(buildGroups(FIXTURE, 'experimental').map((g) => g.indices)).toEqual([
      [0, 2],
      [1, 3],
    ]);
    expect(buildGroups(FIXTURE, 'elastic').map((g) => g.indices)).toEqual([
      [0, 1],
      [2, 3],
    ]);
  });

  it('bins cost by decade, highest first, with a no-data group last', () => {
    const groups = buildGroups(FIXTURE, 'cost');
    expect(groups).toHaveLength(8);
    expect(groups[0]).toMatchObject({ label: '≥ $100k/kg', indices: [3] });
    expect(groups.at(-2)).toMatchObject({ label: '< $1/kg', indices: [1] });
    expect(groups.find((g) => g.indices.includes(0))?.label).toBe('$1 – $10/kg');
    expect(groups.at(-1)).toMatchObject({ key: 'none', indices: [2] });
  });
});

describe('coverageRows', () => {
  it('reports per-category and total coverage percentages', () => {
    const rows = coverageRows(FIXTURE);
    const total = rows.at(-1)!;
    expect(total).toMatchObject({ key: 'all', count: 4, experimentalPct: 50, elasticPct: 50 });
    expect(rows.find((r) => r.key === 'structural')).toMatchObject({
      count: 1,
      elasticPct: 100,
      costPct: 100,
    });
  });
});

describe('materialDetail', () => {
  it('decodes secondary categories, ordering and anchor name', () => {
    const iron = materialDetail(FIXTURE, 1);
    expect(iron.category).toBe('Magnetic');
    expect(iron.otherCategories).toEqual(['Structural']);
    expect(iron.ordering).toBe('FM');
    expect(iron.url).toBe('https://next-gen.materialsproject.org/materials/mp-13');
    expect(materialDetail(FIXTURE, 0).anchor).toBe('Corundum');
  });

  it('marks structural entries whose basis is composition, not elastic data', () => {
    const atlas = structuredClone(FIXTURE);
    expect(materialDetail(atlas, 0).category).toBe('Structural');
    atlas.columns.structural_inferred = [1, 0, 0, 0];
    expect(materialDetail(atlas, 0).category).toBe('Structural (inferred, no elastic data)');
  });
});

describe('fmtNumber', () => {
  it('uses three significant figures with k/M suffixes', () => {
    expect(fmtNumber(0.012345)).toBe('0.0123');
    expect(fmtNumber(12345)).toBe('12.3k');
    expect(fmtNumber(1e6)).toBe('1M');
    expect(fmtNumber(1e12)).toBe('1e12');
    expect(fmtNumber(2.9e13)).toBe('2.9e13');
    expect(fmtNumber(5.5e-10)).toBe('5.5e-10');
  });
});

describe('similarMaterials', () => {
  // Corundum's neighbors: GaAs, Fe, Xx, then a second GaAs (no data) and a second Fe polymorph.
  const atlas = structuredClone(FIXTURE);
  const c = atlas.columns;
  const polymorph = (of: number, k_vrh: number | null) => {
    for (const key of Object.keys(c) as (keyof typeof c)[]) {
      (c[key] as unknown[]).push((c[key] as unknown[])[of]);
    }
    c.k_vrh[c.k_vrh.length - 1] = k_vrh;
    return c.id.length - 1;
  };
  const gaas2 = polymorph(2, null);
  const fe2 = polymorph(1, null);
  const anchor = { ...atlas.anchors[0], similar: [2, 1, 3, gaas2, fe2] };

  it('groups polymorphs by formula in similarity order, counting elastic coverage', () => {
    const items = similarMaterials(atlas, anchor, 'similarity');
    expect(items.map((x) => [x.rank, x.formula, x.polymorphs, x.withElastic])).toEqual([
      [1, 'GaAs', 2, 0],
      [2, 'Fe', 2, 1],
      [3, 'Xx', 1, 0],
    ]);
    expect(items[1].category).toBe('Magnetic');
  });

  it('selects the polymorph that has elastic data when one exists', () => {
    const fe = similarMaterials(atlas, { ...anchor, similar: [fe2, 1] }, 'similarity')[0];
    expect(fe.index).toBe(1); // mp-13 has moduli; the nearer polymorph does not
  });

  it('can put formulas with elastic data first, keeping similarity order within groups', () => {
    const items = similarMaterials(atlas, anchor, 'elastic');
    expect(items.map((x) => x.formula)).toEqual(['Fe', 'GaAs', 'Xx']);
  });

  it('is empty for atlas files built before neighbors existed', () => {
    expect(similarMaterials(atlas, { ...anchor, similar: undefined }, 'similarity')).toEqual([]);
  });
});
