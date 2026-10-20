/** Shape of public/data/atlas.json (written by pipeline/build_atlas.py) and pure helpers over it. */

type Maybe<T> = T | null;

export interface AtlasMeta {
  source: string;
  database_version: string;
  fetched_at: string;
  generated_at: string;
  count: number;
  sampled: boolean;
  coord_scale: number;
  categories: string[];
  orderings: string[];
  rules: Record<string, string>;
}

export interface AtlasColumns {
  id: string[];
  formula: string[];
  x: number[];
  y: number[];
  category: number[];
  /** Bitmask: bit i set = candidate for meta.categories[i]. */
  labels: number[];
  theoretical: number[];
  band_gap: Maybe<number>[];
  formation_energy: Maybe<number>[];
  e_above_hull: Maybe<number>[];
  k_vrh: Maybe<number>[];
  g_vrh: Maybe<number>[];
  ordering: number[];
  cost: Maybe<number>[];
  abundance: Maybe<number>[];
  scarcest: Maybe<string>[];
}

export interface Anchor {
  name: string;
  material_id: string;
  index: number;
}

export interface Atlas {
  meta: AtlasMeta;
  columns: AtlasColumns;
  anchors: Anchor[];
}

export type OverlayId = 'category' | 'experimental' | 'elastic' | 'abundance' | 'cost';

export interface Overlay {
  id: OverlayId;
  label: string;
  note: string;
}

export interface Group {
  key: string;
  label: string;
  color: string;
  indices: number[];
}

export const OVERLAYS: Overlay[] = [
  {
    id: 'category',
    label: 'Category',
    note: 'Primary rule-based candidate category. Click a legend entry to hide or show it.',
  },
  {
    id: 'experimental',
    label: 'Experimental vs. theoretical',
    note: 'Experimental = matched to an observed structure (ICSD); theoretical = computed only.',
  },
  {
    id: 'elastic',
    label: 'Elastic coverage',
    note: 'Whether MP has computed bulk and shear moduli for the entry.',
  },
  {
    id: 'abundance',
    label: 'Abundance',
    note: 'Crustal abundance of the scarcest element in the formula (ppm by mass). Brighter = more abundant.',
  },
  {
    id: 'cost',
    label: 'Cost',
    note: 'Mass-weighted raw element price (USD/kg); a floor that ignores processing. Brighter = pricier.',
  },
];

// Categorical slots 1-4 of the validated dark palette; unclassified is a recessive neutral.
export const CATEGORY_STYLE: Record<string, { label: string; color: string }> = {
  structural: { label: 'Structural', color: '#3987e5' },
  energy: { label: 'Energy', color: '#d95926' },
  electronic_optical: { label: 'Electronic / optical', color: '#199e70' },
  magnetic: { label: 'Magnetic', color: '#c98500' },
  unclassified: { label: 'Unclassified', color: '#566074' },
};

const NO_DATA_COLOR = '#3b4252';
// Blue ramp, dark-surface ordinal steps 600 -> 200: low magnitude recedes, high is bright.
const SEQUENTIAL = ['#184f95', '#1c5cab', '#256abf', '#2a78d6', '#3987e5', '#6da7ec', '#9ec5f4'];
// Decade bins; each list has SEQUENTIAL.length - 1 thresholds.
const COST_THRESHOLDS = [1, 10, 100, 1e3, 1e4, 1e5];
const ABUNDANCE_THRESHOLDS = [0.01, 0.1, 1, 10, 100, 1000];

export function categoryLabel(key: string): string {
  return CATEGORY_STYLE[key]?.label ?? key;
}

/** Group material indices for the chosen overlay. Legend order = array order. */
export function buildGroups(atlas: Atlas, overlay: OverlayId): Group[] {
  const c = atlas.columns;
  const n = c.id.length;
  switch (overlay) {
    case 'category':
      return atlas.meta.categories.map((key, ci) => ({
        key,
        ...CATEGORY_STYLE[key],
        indices: range(n).filter((i) => c.category[i] === ci),
      }));
    case 'experimental':
      return [
        group('experimental', 'Experimental', '#3987e5', n, (i) => c.theoretical[i] === 0),
        group('theoretical', 'Theoretical', '#d95926', n, (i) => c.theoretical[i] === 1),
      ];
    case 'elastic':
      return [
        group('has', 'Has elastic data', '#3987e5', n, (i) => c.k_vrh[i] !== null),
        group('missing', 'No elastic data', '#d95926', n, (i) => c.k_vrh[i] === null),
      ];
    case 'abundance':
      return binGroups(c.abundance, ABUNDANCE_THRESHOLDS, '', ' ppm');
    case 'cost':
      return binGroups(c.cost, COST_THRESHOLDS, '$', '/kg');
  }
}

function binGroups(values: Maybe<number>[], thresholds: number[], prefix: string, unit: string) {
  const fmt = (v: number) => `${prefix}${fmtNumber(v)}`;
  const labels = SEQUENTIAL.map((_, b) => {
    if (b === 0) return `< ${fmt(thresholds[0])}${unit}`;
    if (b === thresholds.length) return `≥ ${fmt(thresholds[b - 1])}${unit}`;
    return `${fmt(thresholds[b - 1])} – ${fmt(thresholds[b])}${unit}`;
  });
  const groups: Group[] = SEQUENTIAL.map((color, b) => ({
    key: `bin${b}`,
    label: labels[b],
    color,
    indices: [],
  }));
  const noData: Group = { key: 'none', label: 'No data', color: NO_DATA_COLOR, indices: [] };
  values.forEach((v, i) => {
    if (v === null) {
      noData.indices.push(i);
    } else {
      const bin = thresholds.findIndex((t) => v < t);
      groups[bin === -1 ? thresholds.length : bin].indices.push(i);
    }
  });
  // Highest magnitude first in the legend.
  return [...groups.reverse(), noData];
}

function group(key: string, label: string, color: string, n: number, test: (i: number) => boolean) {
  return { key, label, color, indices: range(n).filter(test) };
}

function range(n: number): number[] {
  return Array.from({ length: n }, (_, i) => i);
}

export interface CoverageRow {
  key: string;
  label: string;
  count: number;
  experimentalPct: number;
  elasticPct: number;
  costPct: number;
}

/** Per primary category: how much of it is experimentally observed / has elastic / cost data. */
export function coverageRows(atlas: Atlas): CoverageRow[] {
  const c = atlas.columns;
  const tally = (key: string, label: string) => ({
    key,
    label,
    count: 0,
    experimental: 0,
    elastic: 0,
    cost: 0,
  });
  const rows = atlas.meta.categories.map((key) => tally(key, categoryLabel(key)));
  const total = tally('all', 'All materials');
  c.category.forEach((ci, i) => {
    for (const row of [rows[ci], total]) {
      row.count++;
      if (c.theoretical[i] === 0) row.experimental++;
      if (c.k_vrh[i] !== null) row.elastic++;
      if (c.cost[i] !== null) row.cost++;
    }
  });
  const pct = (part: number, whole: number) => (whole ? (100 * part) / whole : 0);
  return [...rows, total].map((r) => ({
    key: r.key,
    label: r.label,
    count: r.count,
    experimentalPct: pct(r.experimental, r.count),
    elasticPct: pct(r.elastic, r.count),
    costPct: pct(r.cost, r.count),
  }));
}

export interface MaterialDetail {
  id: string;
  formula: string;
  url: string;
  category: string;
  color: string;
  otherCategories: string[];
  theoretical: boolean;
  bandGap: Maybe<number>;
  formationEnergy: Maybe<number>;
  eAboveHull: Maybe<number>;
  bulkModulus: Maybe<number>;
  shearModulus: Maybe<number>;
  ordering: string;
  cost: Maybe<number>;
  abundance: Maybe<number>;
  scarcest: Maybe<string>;
  anchor: Maybe<string>;
}

export function materialDetail(atlas: Atlas, i: number): MaterialDetail {
  const c = atlas.columns;
  const categories = atlas.meta.categories;
  const primary = categories[c.category[i]];
  return {
    id: c.id[i],
    formula: c.formula[i],
    url: `https://next-gen.materialsproject.org/materials/${c.id[i]}`,
    category: categoryLabel(primary),
    color: CATEGORY_STYLE[primary]?.color ?? NO_DATA_COLOR,
    otherCategories: categories
      .filter((key, bit) => key !== primary && c.labels[i] & (1 << bit))
      .map(categoryLabel),
    theoretical: c.theoretical[i] === 1,
    bandGap: c.band_gap[i],
    formationEnergy: c.formation_energy[i],
    eAboveHull: c.e_above_hull[i],
    bulkModulus: c.k_vrh[i],
    shearModulus: c.g_vrh[i],
    ordering: atlas.meta.orderings[c.ordering[i]] ?? 'Unknown',
    cost: c.cost[i],
    abundance: c.abundance[i],
    scarcest: c.scarcest[i],
    anchor: atlas.anchors.find((a) => a.index === i)?.name ?? null,
  };
}

/** Compact number: 3 significant figures, k/M suffixes, exponent form outside 1e-3..1e9. */
export function fmtNumber(v: number): string {
  const abs = Math.abs(v);
  if (abs >= 1e9 || (abs > 0 && abs < 1e-3)) {
    return Number(v.toPrecision(3)).toExponential().replace('+', '');
  }
  if (abs >= 1e6) return `${+(v / 1e6).toPrecision(3)}M`;
  if (abs >= 1e3) return `${+(v / 1e3).toPrecision(3)}k`;
  return `${+v.toPrecision(3)}`;
}
