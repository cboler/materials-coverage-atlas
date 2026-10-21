/** Axes and brush filtering for the parallel coordinates view. Pure functions over Atlas. */
import { quantileSorted, scaleLinear, scaleLog, scaleSqrt } from 'd3';
import { Atlas, categoryShortLabel, fmtNumber } from './atlas-data';

/**
 * Every material gets a position t on every axis: 0 = bottom, 1 = top. Missing values sit in a
 * "no data" slot just below the axis (around MISSING_T) and physically impossible values in an
 * "unphysical" slot just above it (UNPHYSICAL_T). Brushes then test one continuous range, and
 * coverage or data-quality gaps show up as lines funneling into a slot.
 */
export const MISSING_T = -0.12;
export const UNPHYSICAL_T = 1.12;
const SLOT_SPREAD = 0.05;
/** Full t range the plot must fit, slots included. */
export const T_MIN = MISSING_T - SLOT_SPREAD;
export const T_MAX = UNPHYSICAL_T + SLOT_SPREAD;
/** Numeric domains span these quantiles (clamped) so a few extreme outliers don't flatten the axis. */
const DOMAIN_QUANTILES = [0.001, 0.999] as const;

type Kind = 'linear' | 'sqrt' | 'log' | 'category';

export interface ParallelAxis {
  key: string;
  /** Full name, for the hover tooltip. */
  label: string;
  /** Axis title lines: a short name, then the unit (if any). */
  title: string[];
  kind: Kind;
  ticks: { t: number; label: string }[];
  positions: Float32Array;
  hasMissing: boolean;
  hasUnphysical: boolean;
}

interface AxisSpec {
  key: keyof Atlas['columns'];
  label: string;
  /** Short name and unit drawn above the axis; the full label is in the tooltip. */
  title: string[];
  kind: Kind;
  levels?: (atlas: Atlas) => string[];
  /**
   * Fixed (lo, hi] domain for quantities with hard physical bounds. MP's elastic fits include
   * values like -4.7e11 GPa; anything outside the bounds goes to the unphysical slot instead of
   * stretching the axis. Bounds match the structural rule's sanity limits in categories.py.
   */
  physical?: [number, number];
}

const SPECS: AxisSpec[] = [
  {
    key: 'category',
    label: 'Category',
    title: ['Category'],
    kind: 'category',
    levels: (a) => a.meta.categories.map(categoryShortLabel),
  },
  {
    key: 'theoretical',
    label: 'Origin',
    title: ['Origin'],
    kind: 'category',
    levels: () => ['Made in a lab', 'Predicted only'],
  },
  { key: 'band_gap', label: 'Band gap (eV)', title: ['Band gap', 'eV'], kind: 'linear' },
  {
    key: 'formation_energy',
    label: 'Formation energy (eV/atom)',
    title: ['Formation E', 'eV/atom'],
    kind: 'linear',
  },
  // Most entries sit within 0.1 eV of the hull; a square-root axis spreads that region out.
  {
    key: 'e_above_hull',
    label: 'Instability (eV/atom above hull)',
    title: ['Instability', 'eV/atom'],
    kind: 'sqrt',
  },
  {
    key: 'k_vrh',
    label: 'Bulk modulus (GPa)',
    title: ['Bulk mod.', 'GPa'],
    kind: 'linear',
    physical: [0, 500],
  },
  {
    key: 'g_vrh',
    label: 'Shear modulus (GPa)',
    title: ['Shear mod.', 'GPa'],
    kind: 'linear',
    physical: [0, 600],
  },
  { key: 'cost', label: 'Element cost ($/kg)', title: ['Cost', '$/kg'], kind: 'log' },
  {
    key: 'abundance',
    label: 'Scarcest element abundance (ppm)',
    title: ['Abundance', 'ppm'],
    kind: 'log',
  },
];

/** Horizontal room an axis's labels need on each side of its line, in px. */
export interface AxisExtent {
  titleLeft: number;
  titleRight: number;
  bodyLeft: number;
  bodyRight: number;
}

/**
 * Axis x positions that keep every label clear of its neighbors and of the plot edges. Titles
 * and bodies (ticks, levels, slots) sit at different heights, so each pair of neighbors only
 * needs room for the wider of the two rows. Spare width is shared between the gaps; when the
 * labels need more than ``available``, the returned width exceeds it and the plot scrolls inside
 * its container instead of overlapping or clipping.
 */
export function axisPositions(
  extents: AxisExtent[],
  available: number,
  edge: number,
  gap: number,
): { xs: number[]; width: number } {
  if (!extents.length) return { xs: [], width: available };
  const xs = [edge + Math.max(extents[0].titleLeft, extents[0].bodyLeft)];
  for (let k = 1; k < extents.length; k++) {
    const a = extents[k - 1];
    const b = extents[k];
    const need = Math.max(a.titleRight + b.titleLeft, a.bodyRight + b.bodyLeft) + gap;
    xs.push(xs[k - 1] + need);
  }
  const last = extents.at(-1)!;
  const needed = xs.at(-1)! + Math.max(last.titleRight, last.bodyRight) + edge;
  const spare = available - needed;
  if (spare > 0 && xs.length > 1) {
    const step = spare / (xs.length - 1);
    return { xs: xs.map((x, k) => x + k * step), width: available };
  }
  if (spare > 0) return { xs: [available / 2], width: available };
  return { xs, width: Math.ceil(needed) };
}

/** Deterministic per-material jitter in [-0.5, 0.5): spreads lines into ribbons on category axes. */
function jitter(i: number, salt: number): number {
  return (Math.imul(i + 1, 2654435761 + salt) >>> 0) / 2 ** 32 - 0.5;
}

export function buildAxes(atlas: Atlas): ParallelAxis[] {
  return SPECS.map((spec, s) => {
    const values = atlas.columns[spec.key] as (number | null)[];
    const positions = new Float32Array(values.length);
    let hasMissing = false;
    let hasUnphysical = false;

    if (spec.kind === 'category') {
      const levels = spec.levels!(atlas);
      const step = 1 / levels.length;
      values.forEach((v, i) => {
        // Level 0 at the top; lines fill 70% of each level's band.
        positions[i] = 1 - ((v as number) + 0.5) * step + jitter(i, s) * step * 0.7;
      });
      return {
        key: spec.key,
        label: spec.label,
        title: spec.title,
        kind: spec.kind,
        ticks: levels.map((label, l) => ({ t: 1 - (l + 0.5) * step, label })),
        positions,
        hasMissing,
        hasUnphysical,
      };
    }

    const physical = spec.physical;
    const isUnphysical = (v: number) => !!physical && (v <= physical[0] || v > physical[1]);
    let [lo, hi] = physical ?? [0, 1];
    if (!physical) {
      const valid = values.filter((v): v is number => v !== null && (spec.kind !== 'log' || v > 0));
      valid.sort((a, b) => a - b);
      lo = quantileSorted(valid, DOMAIN_QUANTILES[0]) ?? 0;
      hi = quantileSorted(valid, DOMAIN_QUANTILES[1]) ?? 1;
    }
    const base =
      spec.kind === 'log' ? scaleLog() : spec.kind === 'sqrt' ? scaleSqrt() : scaleLinear();
    const scale = base
      .domain([lo, hi === lo ? lo + 1 : hi])
      .range([0, 1])
      .clamp(true);

    values.forEach((v, i) => {
      if (v === null || (spec.kind === 'log' && v <= 0)) {
        hasMissing = true;
        positions[i] = MISSING_T + jitter(i, s) * SLOT_SPREAD;
      } else if (isUnphysical(v)) {
        hasUnphysical = true;
        positions[i] = UNPHYSICAL_T + jitter(i, s) * SLOT_SPREAD;
      } else {
        positions[i] = scale(v);
      }
    });

    let tickValues = scale.ticks(5);
    if (spec.kind === 'log') tickValues = tickValues.filter((v) => Number.isInteger(Math.log10(v)));
    return {
      key: spec.key,
      label: spec.label,
      title: spec.title,
      kind: spec.kind,
      ticks: tickValues.map((v) => ({ t: scale(v), label: fmtNumber(v) })),
      positions,
      hasMissing,
      hasUnphysical,
    };
  });
}

/** Brushed range on one axis, in t units (may extend into either slot). */
export interface AxisBrush {
  lo: number;
  hi: number;
}

/** 1 = passes every active brush; null when nothing is brushed. */
export function filterMask(
  axes: ParallelAxis[],
  brushes: ReadonlyMap<string, AxisBrush>,
): Uint8Array | null {
  const active = axes.filter((a) => brushes.has(a.key));
  if (!active.length) return null;
  const n = active[0].positions.length;
  const mask = new Uint8Array(n).fill(1);
  for (const axis of active) {
    const { lo, hi } = brushes.get(axis.key)!;
    const pos = axis.positions;
    for (let i = 0; i < n; i++) {
      if (mask[i] && (pos[i] < lo || pos[i] > hi)) mask[i] = 0;
    }
  }
  return mask;
}
