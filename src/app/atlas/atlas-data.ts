/** Shape of public/data/atlas.json (written by pipeline/build_atlas.py) and pure helpers over it. */
import { CATEGORY_HELP } from './explain';

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
  /**
   * 1 = structural by the candidate (composition) rule because there is no usable elastic data:
   * none computed, or an unphysical fit. Absent in atlas files built before it existed.
   */
  structural_inferred?: number[];
  /** 1 = passes the moduli-blind structural-candidate rule. Absent in older atlas files. */
  structural_candidate?: number[];
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
  /** Nearest materials in feature space, nearest first. Absent in atlas files built before it. */
  similar?: number[];
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
  /** Plain-language meaning, shown under the legend entry. */
  help?: string;
  /** Extra breakdown shown under the help text (e.g. verified vs inferred structural). */
  detail?: string;
}

export const OVERLAYS: Overlay[] = [
  {
    id: 'category',
    label: 'Category',
    note: 'What each material might be good for, from simple rules on its computed properties (see "Category rules" below). Click an entry to hide or show it.',
  },
  {
    id: 'experimental',
    label: 'Lab-made vs. predicted',
    note: 'Blue: its crystal has been made and recorded in a lab. Orange: so far it exists only as a computer prediction.',
  },
  {
    id: 'elastic',
    label: 'Stiffness data',
    note: 'Blue: Materials Project has computed how stiff it is (its elastic moduli). Orange: no stiffness data yet, which is most of the map.',
  },
  {
    id: 'abundance',
    label: 'Abundance',
    note: "How common the rarest element in each formula is in Earth's crust. Brighter means more common, so easier to source.",
  },
  {
    id: 'cost',
    label: 'Cost',
    note: 'Raw price of the elements in 1 kg of the material, ignoring processing. Brighter means more expensive.',
  },
];

// Categorical slots 1-4 of the validated dark palette; unclassified is a recessive neutral. The two
// structural kinds share the blue family: slot 1 for metals, blue step 200 for minerals/ceramics.
// That pair, and step 200 against every other slot, clears the CVD and normal-vision checks.
export const CATEGORY_STYLE: Record<string, { label: string; color: string }> = {
  structural: { label: 'Structural', color: '#3987e5' }, // atlas files from before the split
  structural_metallic: { label: 'Structural – metallic/alloy', color: '#3987e5' },
  structural_ceramic: { label: 'Structural – mineral/ceramic', color: '#9ec5f4' },
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
      return atlas.meta.categories.map((key, ci) => {
        const indices = range(n).filter((i) => c.category[i] === ci);
        const split = isStructural(key) ? structuralSplit(atlas, indices) : null;
        return {
          key,
          ...CATEGORY_STYLE[key],
          help: CATEGORY_HELP[key],
          detail: split
            ? `${fmtCount(split.verified)} verified by stiffness data · ${fmtCount(split.inferred)} inferred without it`
            : undefined,
          indices,
        };
      });
    case 'experimental':
      return [
        group('experimental', 'Made in a lab', '#3987e5', n, (i) => c.theoretical[i] === 0),
        group('theoretical', 'Predicted only', '#d95926', n, (i) => c.theoretical[i] === 1),
      ];
    case 'elastic':
      return [
        group('has', 'Stiffness computed', '#3987e5', n, (i) => c.k_vrh[i] !== null),
        group('missing', 'No stiffness data', '#d95926', n, (i) => c.k_vrh[i] === null),
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

/** Structural categories ("structural", or its metallic/ceramic split). */
export function isStructural(key: string): boolean {
  return key.startsWith('structural');
}

/** How many structural entries rest on stiffness data (verified) vs the candidate rule (inferred). */
export function structuralSplit(atlas: Atlas, indices: number[]) {
  const inferredCol = atlas.columns.structural_inferred;
  const inferred = inferredCol ? indices.filter((i) => inferredCol[i]).length : 0;
  return { verified: indices.length - inferred, inferred };
}

function fmtCount(n: number): string {
  return n.toLocaleString('en-US');
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
  /**
   * 'category': materials whose map color (primary category) is this one; rows sum to the total.
   * 'candidates': the moduli-blind structural-candidate population, which overlaps the categories.
   * 'all': every material.
   */
  kind: 'category' | 'candidates' | 'all';
  count: number;
  experimentalPct: number;
  elasticPct: number;
  costPct: number;
  /** The category's own rule admits entries for having stiffness data, so elasticPct is partly built in. */
  elasticBuiltIn: boolean;
  /** Structural rows: entries admitted by stiffness data vs inferred by the candidate rule. */
  verified?: number;
  inferred?: number;
}

/**
 * Per primary category: how much of it is experimentally observed / has elastic / cost data. When
 * the atlas carries the structural-candidate flag, a row for that population comes before the
 * total: it is defined without moduli, so its stiffness share compares fairly with other rows.
 */
export function coverageRows(atlas: Atlas): CoverageRow[] {
  const c = atlas.columns;
  const tally = (key: string, label: string, kind: CoverageRow['kind']) => ({
    key,
    label,
    kind,
    indices: [] as number[],
    experimental: 0,
    elastic: 0,
    cost: 0,
  });
  const rows = atlas.meta.categories.map((key) => tally(key, categoryLabel(key), 'category'));
  const candidates = tally('structural_candidate', 'Structural candidates', 'candidates');
  const total = tally('all', 'All materials', 'all');
  c.category.forEach((ci, i) => {
    const targets = [rows[ci], total];
    if (c.structural_candidate?.[i]) targets.push(candidates);
    for (const row of targets) {
      row.indices.push(i);
      if (c.theoretical[i] === 0) row.experimental++;
      if (c.k_vrh[i] !== null) row.elastic++;
      if (c.cost[i] !== null) row.cost++;
    }
  });
  const pct = (part: number, whole: number) => (whole ? (100 * part) / whole : 0);
  const all = c.structural_candidate ? [...rows, candidates, total] : [...rows, total];
  return all.map((r) => {
    const builtIn = r.kind === 'category' && isStructural(r.key);
    const count = r.indices.length;
    return {
      key: r.key,
      label: r.label,
      kind: r.kind,
      count,
      experimentalPct: pct(r.experimental, count),
      elasticPct: pct(r.elastic, count),
      costPct: pct(r.cost, count),
      elasticBuiltIn: builtIn,
      ...(builtIn ? structuralSplit(atlas, r.indices) : {}),
    };
  });
}

/** Materials that pass more than one category rule (only the first match colors the map). */
export function multiCategoryCount(atlas: Atlas): number {
  let n = 0;
  for (const bits of atlas.columns.labels) if (bits & (bits - 1)) n++;
  return n;
}

/**
 * Size of the moduli-blind structural-candidate population and the share that never had stiffness
 * calculated; null for atlas files without the flag.
 */
export function candidateCoverage(atlas: Atlas): { count: number; neverPct: number } | null {
  const flags = atlas.columns.structural_candidate;
  if (!flags) return null;
  let count = 0;
  let never = 0;
  flags.forEach((f, i) => {
    if (!f) return;
    count++;
    if (atlas.columns.k_vrh[i] === null) never++;
  });
  return { count, neverPct: count ? (100 * never) / count : 0 };
}

export interface MaterialDetail {
  id: string;
  formula: string;
  url: string;
  category: string;
  color: string;
  otherCategories: string[];
  /** Why the material counts as structural, or null when it doesn't. */
  structuralBasis: Maybe<string>;
  /** Passes the moduli-blind structural-candidate rule (null for atlas files without the flag). */
  structuralCandidate: Maybe<boolean>;
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

/** One formula among an anchor's neighbors; polymorphs (same formula) are grouped. */
export interface SimilarItem {
  /** Entry to select: the nearest polymorph with elastic data, else the nearest polymorph. */
  index: number;
  /** 1 = most similar formula. */
  rank: number;
  formula: string;
  id: string;
  category: string;
  color: string;
  polymorphs: number;
  /** How many of those polymorphs have elastic data. */
  withElastic: number;
}

/** Distinct formulas shown per anchor. */
export const SIMILAR_SHOWN = 20;

export type SimilarSort = 'similarity' | 'elastic';

/**
 * An anchor's precomputed neighbors grouped by formula, in similarity order or with formulas that
 * have elastic data first (similarity order kept within each group): "what near portlandite
 * already has moduli?"
 */
export function similarMaterials(atlas: Atlas, anchor: Anchor, sort: SimilarSort): SimilarItem[] {
  const c = atlas.columns;
  const byFormula = new Map<string, number[]>();
  for (const i of anchor.similar ?? []) {
    const list = byFormula.get(c.formula[i]) ?? [];
    list.push(i);
    byFormula.set(c.formula[i], list);
  }
  const items = [...byFormula].slice(0, SIMILAR_SHOWN).map(([formula, entries], k): SimilarItem => {
    const elastic = entries.filter((i) => c.k_vrh[i] !== null);
    const index = elastic[0] ?? entries[0];
    const key = atlas.meta.categories[c.category[index]];
    return {
      index,
      rank: k + 1,
      formula,
      id: c.id[index],
      category: categoryLabel(key),
      color: CATEGORY_STYLE[key]?.color ?? NO_DATA_COLOR,
      polymorphs: entries.length,
      withElastic: elastic.length,
    };
  });
  return sort === 'elastic'
    ? [...items.filter((x) => x.withElastic), ...items.filter((x) => !x.withElastic)]
    : items;
}

export function materialDetail(atlas: Atlas, i: number): MaterialDetail {
  const c = atlas.columns;
  const categories = atlas.meta.categories;
  const primary = categories[c.category[i]];
  const structuralBit = categories.findIndex(
    (key, bit) => isStructural(key) && c.labels[i] & (1 << bit),
  );
  const inferred = !!c.structural_inferred?.[i];
  const basis =
    structuralBit === -1
      ? null
      : !inferred
        ? 'Verified: stiffness data passes the structural rule'
        : c.k_vrh[i] === null
          ? 'Inferred from composition: stiffness never calculated'
          : 'Inferred from composition: stiffness calculation unphysical';
  return {
    id: c.id[i],
    formula: c.formula[i],
    url: `https://next-gen.materialsproject.org/materials/${c.id[i]}`,
    category:
      isStructural(primary) && inferred
        ? `${categoryLabel(primary)} (inferred, no usable stiffness data)`
        : categoryLabel(primary),
    color: CATEGORY_STYLE[primary]?.color ?? NO_DATA_COLOR,
    otherCategories: categories
      .filter((key, bit) => key !== primary && c.labels[i] & (1 << bit))
      .map(categoryLabel),
    structuralBasis: basis,
    structuralCandidate: c.structural_candidate ? c.structural_candidate[i] === 1 : null,
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
