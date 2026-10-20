import { buildGroups, coverageRows, fmtNumber, materialDetail } from './atlas-data';
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
});

describe('fmtNumber', () => {
  it('uses three significant figures with k/M suffixes', () => {
    expect(fmtNumber(0.012345)).toBe('0.0123');
    expect(fmtNumber(12345)).toBe('12.3k');
    expect(fmtNumber(1e6)).toBe('1M');
  });
});
