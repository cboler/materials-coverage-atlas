import {
  availableOverlays,
  buildGroups,
  entrySummary,
  candidateCoverage,
  coverageRows,
  fmtNumber,
  materialDetail,
  multiCategoryCount,
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

  it('marks the structural stiffness share as built in and splits verified vs inferred', () => {
    const atlas = structuredClone(FIXTURE);
    atlas.columns.structural_inferred = [0, 0, 0, 0];
    const rows = coverageRows(atlas);
    expect(rows.find((r) => r.key === 'structural')).toMatchObject({
      elasticBuiltIn: true,
      verified: 1,
      inferred: 0,
    });
    expect(rows.find((r) => r.key === 'energy')).toMatchObject({ elasticBuiltIn: false });
    expect(rows.find((r) => r.key === 'energy')?.verified).toBeUndefined();
  });

  it('adds a moduli-blind structural-candidate row before the total when the flag exists', () => {
    expect(coverageRows(FIXTURE).some((r) => r.kind === 'candidates')).toBe(false);
    const atlas = structuredClone(FIXTURE);
    // Corundum (has moduli) and the no-data entry are candidates; iron is not in this fixture.
    atlas.columns.structural_candidate = [1, 0, 0, 1];
    const rows = coverageRows(atlas);
    expect(rows.at(-1)?.kind).toBe('all');
    expect(rows.at(-2)).toMatchObject({
      kind: 'candidates',
      count: 2,
      elasticPct: 50,
      elasticBuiltIn: false,
    });
    expect(candidateCoverage(atlas)).toEqual({ count: 2, neverPct: 50 });
    expect(candidateCoverage(FIXTURE)).toBeNull();
  });
});

describe('structural metallic/ceramic split', () => {
  // Corundum becomes ceramic and iron metallic: categories gain one slot, so indices shift by one.
  const atlas = structuredClone(FIXTURE);
  atlas.meta.categories = [
    'structural_metallic',
    'structural_ceramic',
    'energy',
    'electronic_optical',
    'magnetic',
    'unclassified',
  ];
  atlas.columns.category = [1, 4, 2, 5];
  atlas.columns.labels = [0b00010, 0b10001, 0b01100, 0];
  atlas.columns.structural_inferred = [0, 0, 0, 0];

  it('labels, colors and explains both structural kinds', () => {
    const groups = buildGroups(atlas, 'category');
    expect(groups.slice(0, 2).map((g) => g.label)).toEqual([
      'Structural – metallic/alloy',
      'Structural – mineral/ceramic',
    ]);
    expect(groups[0].color).not.toBe(groups[1].color);
    expect(groups.slice(0, 2).every((g) => g.help && g.detail)).toBe(true);
  });

  it('marks both structural rows as built in and gives secondary membership a basis', () => {
    const rows = coverageRows(atlas);
    expect(rows.filter((r) => r.elasticBuiltIn).map((r) => r.key)).toEqual([
      'structural_metallic',
      'structural_ceramic',
    ]);
    const iron = materialDetail(atlas, 1);
    expect(iron.category).toBe('Magnetic');
    expect(iron.otherCategories).toEqual(['Structural – metallic/alloy']);
    expect(iron.structuralBasis).toMatch(/^Verified/);
  });
});

describe('newer-entries overlay', () => {
  const withEntries = () => {
    const atlas = structuredClone(FIXTURE);
    atlas.columns.entry_group = [0, 1, 2, 3];
    atlas.meta.provenance = {
      basis: 'entry order',
      tier_edges: [1_000_000, 1_500_000],
      tier_labels: ['before ~2017', '~2017–2020', '~2020 onward'],
      ml_origin_note: 'none',
      knn: {
        k: 10,
        newer: 13441,
        older: 140936,
        median_newer_to_older: 0.452,
        median_older_to_older: 0.438,
        share_newer_sparse: 0.128,
        share_expected: 0.25,
      },
    };
    return atlas;
  };

  it('is only offered when the atlas has entry groups', () => {
    expect(availableOverlays(FIXTURE).map((o) => o.id)).not.toContain('entry');
    expect(availableOverlays(withEntries()).map((o) => o.id)).toContain('entry');
  });

  it('puts newer sparse and crowded entries first, older tiers after', () => {
    const groups = buildGroups(withEntries(), 'entry');
    expect(groups.map((g) => [g.key, g.indices])).toEqual([
      ['new_sparse', [3]],
      ['new_crowded', [2]],
      ['mid', [1]],
      ['old', [0]],
    ]);
    expect(groups[0].label).toBe('Added ~2020 onward, sparse area');
  });

  it('summarizes whether newer entries fill gaps or crowd clusters', () => {
    const atlas = withEntries();
    expect(entrySummary(atlas)).toBe(
      'Of 13,441 entries added ~2020 onward, 13% land in sparse areas, against 25% if they ' +
        "matched the older materials' spread, so most newer entries crowd existing clusters " +
        'rather than filling gaps.',
    );
    atlas.meta.provenance!.knn.share_newer_sparse = 0.4;
    expect(entrySummary(atlas)).toContain('lean toward filling gaps');
    expect(entrySummary(FIXTURE)).toBeNull();
  });
});

describe('multiCategoryCount', () => {
  it('counts materials whose label bitmask has more than one bit', () => {
    // Iron (structural + magnetic) and GaAs (energy + electronic) match two rules each.
    expect(multiCategoryCount(FIXTURE)).toBe(2);
  });
});

describe('category legend', () => {
  it('shows how many structural entries are verified vs inferred', () => {
    const atlas = structuredClone(FIXTURE);
    atlas.columns.structural_inferred = [1, 0, 0, 0];
    const structural = buildGroups(atlas, 'category').find((g) => g.key === 'structural');
    expect(structural?.detail).toBe('0 verified by stiffness data · 1 inferred without it');
    expect(buildGroups(atlas, 'category').find((g) => g.key === 'energy')?.detail).toBeUndefined();
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
    expect(materialDetail(atlas, 0).structuralBasis).toBe(
      'Verified: stiffness data passes the structural rule',
    );
    atlas.columns.structural_inferred = [1, 0, 0, 0];
    expect(materialDetail(atlas, 0).category).toBe(
      'Structural (inferred, no usable stiffness data)',
    );
    // Corundum has moduli in the fixture, so an inferred basis means the fit was unphysical.
    expect(materialDetail(atlas, 0).structuralBasis).toBe(
      'Inferred from composition: stiffness calculation unphysical',
    );
    atlas.columns.k_vrh[0] = null;
    expect(materialDetail(atlas, 0).structuralBasis).toBe(
      'Inferred from composition: stiffness never calculated',
    );
  });

  it('gives a structural basis for secondary structural membership and none otherwise', () => {
    // Iron is magnetic first but also flagged structural.
    expect(materialDetail(FIXTURE, 1).structuralBasis).toMatch(/^Verified/);
    expect(materialDetail(FIXTURE, 2).structuralBasis).toBeNull();
  });

  it('reports structural candidacy only when the atlas carries the flag', () => {
    expect(materialDetail(FIXTURE, 0).structuralCandidate).toBeNull();
    const atlas = structuredClone(FIXTURE);
    atlas.columns.structural_candidate = [1, 0, 0, 0];
    expect(materialDetail(atlas, 0).structuralCandidate).toBe(true);
    expect(materialDetail(atlas, 2).structuralCandidate).toBe(false);
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
