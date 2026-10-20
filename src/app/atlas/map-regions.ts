/**
 * Named regions of the UMAP map: islands of nearby materials, labeled by their dominant chemistry.
 * Pure functions over Atlas, computed once per data load in the browser (no pipeline step).
 *
 * Islands are 8-connected components of occupied cells on a coarse grid over the map's quantized
 * coordinates. Each island is named "<distinctive elements> <dominant family>", e.g.
 * "Li–Fe phosphates". Distinctive elements are the ones most over-represented in the island
 * relative to the whole database (lift), so the label says what sets the island apart rather
 * than repeating oxygen everywhere.
 */
import type { Atlas } from './atlas-data';

/** Grid cell edge in quantized map units (coordinates span 0..coord_scale, typically 10,000). */
const CELL = 80;
/** A cell counts as occupied with at least this many materials, so stray points don't bridge islands. */
const MIN_CELL_COUNT = 3;
/** Islands bigger than this share are re-split at a higher density threshold. */
const MAX_REGION_SHARE = 0.06;
/** Stop re-splitting once cells need this many materials to count. */
const MAX_THRESHOLD = 256;
/** Islands smaller than this share of the database stay unlabeled. */
const MIN_REGION_SHARE = 0.004;
/** An element must appear in this share of an island's materials to name it... */
const MIN_ELEMENT_SHARE = 0.25;
/** ...and be at least this many times more common there than across the database. */
const MIN_LIFT = 1.5;

export interface MapRegion {
  label: string;
  /** Label position in quantized map units: center of the island's densest cell. */
  x: number;
  y: number;
  /** Island bounding box in quantized map units, for deciding when the label fits on screen. */
  width: number;
  height: number;
  size: number;
  /** Share of the island's materials in its dominant family. */
  familyShare: number;
}

const ELEMENT = /[A-Z][a-z]?/g;

export function parseElements(formula: string): string[] {
  return [...new Set(formula.match(ELEMENT) ?? [])];
}

// Checked in order: the first matching rule names the family.
const FAMILIES: { name: string; test: (e: ReadonlySet<string>) => boolean; anions: string[] }[] = [
  // Organic ligands (methylammonium, formates, cyanide hydrates...) first: their O, N or halogen
  // content would otherwise scatter them across the anion families.
  { name: 'metal–organics', test: (e) => e.has('C') && e.has('H'), anions: ['C', 'H', 'N', 'O'] },
  { name: 'silicates', test: (e) => e.has('O') && e.has('Si'), anions: ['O', 'Si'] },
  { name: 'phosphates', test: (e) => e.has('O') && e.has('P'), anions: ['O', 'P'] },
  { name: 'sulfates', test: (e) => e.has('O') && e.has('S'), anions: ['O', 'S'] },
  { name: 'carbonates', test: (e) => e.has('O') && e.has('C'), anions: ['O', 'C'] },
  { name: 'borates', test: (e) => e.has('O') && e.has('B'), anions: ['O', 'B'] },
  { name: 'oxides', test: (e) => e.has('O'), anions: ['O', 'H'] },
  {
    name: 'halides',
    test: (e) => ['F', 'Cl', 'Br', 'I'].some((x) => e.has(x)),
    anions: ['F', 'Cl', 'Br', 'I'],
  },
  {
    name: 'chalcogenides',
    test: (e) => ['S', 'Se', 'Te'].some((x) => e.has(x)),
    anions: ['S', 'Se', 'Te'],
  },
  { name: 'nitrides', test: (e) => e.has('N'), anions: ['N'] },
  {
    name: 'pnictides',
    test: (e) => ['P', 'As', 'Sb'].some((x) => e.has(x)),
    anions: ['P', 'As', 'Sb'],
  },
  { name: 'carbides', test: (e) => e.has('C'), anions: ['C'] },
  { name: 'borides', test: (e) => e.has('B'), anions: ['B'] },
  { name: 'hydrides', test: (e) => e.has('H'), anions: ['H'] },
  { name: 'elements', test: (e) => e.size === 1, anions: [] },
  { name: 'intermetallics', test: () => true, anions: [] },
];

export function chemicalFamily(elements: ReadonlySet<string>): string {
  return FAMILIES.find((f) => f.test(elements))!.name;
}

export function findRegions(
  atlas: Atlas,
  { cell = CELL, minCellCount = MIN_CELL_COUNT, maxRegionShare = MAX_REGION_SHARE } = {},
): MapRegion[] {
  const { x, y, formula } = atlas.columns;
  const n = x.length;
  if (!n) return [];
  const cols = Math.ceil((x.reduce((m, v) => Math.max(m, v), 0) + 1) / cell);
  const rows = Math.ceil((y.reduce((m, v) => Math.max(m, v), 0) + 1) / cell);

  const cellOf = new Int32Array(n);
  const counts = new Int32Array(cols * rows);
  for (let i = 0; i < n; i++) {
    const c = Math.floor(y[i] / cell) * cols + Math.floor(x[i] / cell);
    cellOf[i] = c;
    counts[c]++;
  }

  /** 8-connected components among `cells` whose count reaches `threshold`. */
  const seen = new Int32Array(cols * rows).fill(-1);
  let pass = 0;
  const components = (cells: number[], threshold: number): number[][] => {
    pass++;
    const inSet = new Set(cells.filter((c) => counts[c] >= threshold));
    const result: number[][] = [];
    for (const startCell of inSet) {
      if (seen[startCell] === pass) continue;
      seen[startCell] = pass;
      const comp: number[] = [];
      const stack = [startCell];
      while (stack.length) {
        const c = stack.pop()!;
        comp.push(c);
        const cx = c % cols;
        const cy = (c - cx) / cols;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const nx = cx + dx;
            const ny = cy + dy;
            if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
            const nc = ny * cols + nx;
            if (inSet.has(nc) && seen[nc] !== pass) {
              seen[nc] = pass;
              stack.push(nc);
            }
          }
        }
      }
      result.push(comp);
    }
    return result;
  };

  // Hierarchical split: an island too big to say anything specific about is re-split at double
  // the density threshold until it breaks apart (the idea behind HDBSCAN's cluster tree).
  const maxSize = n * maxRegionShare;
  const pointsIn = (comp: number[]) => comp.reduce((sum, c) => sum + counts[c], 0);
  const split = (cells: number[], threshold: number): number[][] =>
    components(cells, threshold).flatMap((comp) => {
      if (pointsIn(comp) <= maxSize || threshold >= MAX_THRESHOLD) return [comp];
      const parts = split(comp, threshold * 2);
      return parts.length > 1 ? parts : [comp];
    });
  const allCells = Array.from(counts.keys()).filter((c) => counts[c] > 0);
  const regionCells = split(allCells, minCellCount);

  const regionOfCell = new Int32Array(cols * rows).fill(-1);
  regionCells.forEach((cells, r) => cells.forEach((c) => (regionOfCell[c] = r)));
  const members: number[][] = regionCells.map(() => []);
  for (let i = 0; i < n; i++) {
    const r = regionOfCell[cellOf[i]];
    if (r >= 0) members[r].push(i);
  }

  const elementsOf = formula.map((f) => new Set(parseElements(f)));
  const globalShare = elementShares(elementsOf, null);
  const minSize = Math.max(50, Math.round(n * MIN_REGION_SHARE));

  return members
    .filter((m) => m.length >= minSize)
    .map((m) => {
      const families = new Map<string, number>();
      for (const i of m) {
        const f = chemicalFamily(elementsOf[i]);
        families.set(f, (families.get(f) ?? 0) + 1);
      }
      const [family, familyCount] = [...families].sort((a, b) => b[1] - a[1])[0];
      const anions = new Set(FAMILIES.find((f) => f.name === family)!.anions);

      const share = elementShares(elementsOf, m);
      const distinctive = [...share]
        .filter(([el, s]) => !anions.has(el) && s >= MIN_ELEMENT_SHARE)
        .map(([el, s]) => ({ el, lift: s / globalShare.get(el)! }))
        .filter((d) => d.lift >= MIN_LIFT)
        .sort((a, b) => b.lift - a.lift)
        .slice(0, 2)
        .map((d) => d.el);

      // Densest cell anchors the label: always inside the island, unlike the centroid of a ring.
      const cellCounts = new Map<number, number>();
      let x0 = Infinity,
        x1 = -Infinity,
        y0 = Infinity,
        y1 = -Infinity;
      for (const i of m) {
        cellCounts.set(cellOf[i], (cellCounts.get(cellOf[i]) ?? 0) + 1);
        x0 = Math.min(x0, x[i]);
        x1 = Math.max(x1, x[i]);
        y0 = Math.min(y0, y[i]);
        y1 = Math.max(y1, y[i]);
      }
      const densest = [...cellCounts].sort((a, b) => b[1] - a[1])[0][0];

      return {
        label: distinctive.length ? `${distinctive.join('–')} ${family}` : family,
        x: ((densest % cols) + 0.5) * cell,
        y: (Math.floor(densest / cols) + 0.5) * cell,
        width: x1 - x0,
        height: y1 - y0,
        size: m.length,
        familyShare: familyCount / m.length,
      };
    })
    .sort((a, b) => b.size - a.size);
}

/** Share of materials containing each element, over `indices` (or all materials when null). */
function elementShares(elementsOf: Set<string>[], indices: number[] | null): Map<string, number> {
  const counts = new Map<string, number>();
  const list = indices ?? elementsOf.map((_, i) => i);
  for (const i of list) for (const el of elementsOf[i]) counts.set(el, (counts.get(el) ?? 0) + 1);
  return new Map([...counts].map(([el, c]) => [el, c / list.length]));
}
