import {
  Component,
  ElementRef,
  OnDestroy,
  afterNextRender,
  computed,
  effect,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { AtlasGuideComponent } from './atlas-guide.component';
import { ParallelCoordinatesComponent } from './parallel-coordinates.component';
import {
  contourDensity,
  geoPath,
  quadtree,
  select,
  zoom,
  zoomIdentity,
  type ContourDensity,
  type ContourMultiPolygon,
  type Quadtree,
  type Selection,
  type ZoomBehavior,
  type ZoomTransform,
} from 'd3';
import {
  Atlas,
  OVERLAYS,
  OverlayId,
  SimilarSort,
  buildGroups,
  candidateCoverage,
  categoryLabel,
  coverageRows,
  fmtNumber,
  materialDetail,
  similarMaterials,
} from './atlas-data';
import {
  CATEGORY_HELP,
  TERMS,
  describeGap,
  describeOrigin,
  describeStability,
  describeStiffness,
} from './explain';
import { findRegions } from './map-regions';

/** d3-contour 4 adds density.contours(); @types/d3-contour 3.x does not declare it yet. */
type ContourDensityV4 = ContourDensity<number> & {
  contours(data: number[]): ((threshold: number) => ContourMultiPolygon) & { max: number };
};

type LoadState = 'loading' | 'ready' | 'missing' | 'error';

const DATA_URL = 'data/atlas.json'; // relative: resolves against <base href> on GitHub Pages
const PADDING = 24;
const FILTERED_OUT = '#2b3343';
// Density contour levels as fractions of peak density. Below ~2% the lines trace stray points.
const CONTOUR_LEVELS = [0.02, 0.07, 0.25];
const CONTOUR_BANDWIDTH = 8; // world px
/** Region labels appear once their island spans this many screen pixels. */
const REGION_MIN_PX = 36;
const HOVER_RADIUS = 10; // screen px; larger than the marks so small points are easy to hit
const RULE_ORDER = [
  'gate',
  'structural',
  'structural_candidate',
  'energy',
  'electronic_optical',
  'magnetic',
  'unclassified',
  'priority',
];
const RULE_LABELS: Record<string, string> = {
  gate: 'All categories',
  priority: 'Coloring',
  structural_candidate: 'Structural candidates',
  structural: 'Structural (both kinds)',
};

@Component({
  selector: 'app-atlas',
  standalone: true,
  imports: [DecimalPipe, AtlasGuideComponent, ParallelCoordinatesComponent],
  templateUrl: './atlas.component.html',
  styleUrl: './atlas.component.scss',
})
export class AtlasComponent implements OnDestroy {
  private readonly plotRef = viewChild.required<ElementRef<HTMLDivElement>>('plot');
  private readonly canvasRef = viewChild.required<ElementRef<HTMLCanvasElement>>('canvas');
  private readonly svgRef = viewChild.required<ElementRef<SVGSVGElement>>('svg');

  protected readonly overlays = OVERLAYS;
  protected readonly fmt = fmtNumber;
  protected readonly terms = TERMS;
  protected readonly glossary = Object.values(TERMS);
  protected readonly describe = {
    gap: describeGap,
    stability: describeStability,
    stiffness: describeStiffness,
    origin: describeOrigin,
  };
  protected readonly atlas = signal<Atlas | null>(null);
  protected readonly state = signal<LoadState>('loading');
  protected readonly overlayId = signal<OverlayId>('category');
  protected readonly hidden = signal<ReadonlySet<string>>(new Set());
  protected readonly hovered = signal<number | null>(null);
  protected readonly selected = signal<number | null>(null);
  /** Materials matching the parallel-coordinates brushes (1 = match), or null when unfiltered. */
  protected readonly filterMask = signal<Uint8Array | null>(null);
  protected readonly filteredCount = computed(() => {
    const mask = this.filterMask();
    return mask ? mask.reduce((n, v) => n + v, 0) : null;
  });
  protected readonly tooltipAt = signal({ x: 0, y: 0, flip: false });
  protected readonly showContours = signal(true);
  /** Index of the anchor whose "similar materials" panel is open. */
  protected readonly similarFor = signal<number | null>(null);
  protected readonly similarSort = signal<SimilarSort>('similarity');
  protected readonly similarAnchor = computed(() => {
    const i = this.similarFor();
    return this.atlas()?.anchors.find((a) => a.index === i && a.similar?.length) ?? null;
  });
  protected readonly similarItems = computed(() => {
    const atlas = this.atlas();
    const anchor = this.similarAnchor();
    return atlas && anchor ? similarMaterials(atlas, anchor, this.similarSort()) : [];
  });
  protected readonly similarWithElastic = computed(
    () => this.similarItems().filter((x) => x.withElastic).length,
  );
  /** Whether the selected material is an anchor with neighbors whose panel is closed. */
  protected readonly canShowSimilar = computed(() => {
    const i = this.selected();
    return (
      i !== null &&
      this.similarFor() !== i &&
      !!this.atlas()?.anchors.some((a) => a.index === i && a.similar?.length)
    );
  });
  protected readonly showRegions = signal(true);
  /** Named islands of the map (computed once per data load; ~0.2 s for the full database). */
  private readonly regions = computed(() => {
    const atlas = this.atlas();
    return atlas ? findRegions(atlas) : [];
  });

  protected readonly groups = computed(() => {
    const atlas = this.atlas();
    return atlas ? buildGroups(atlas, this.overlayId()) : [];
  });
  protected readonly overlayNote = computed(
    () => OVERLAYS.find((o) => o.id === this.overlayId())?.note ?? '',
  );
  protected readonly coverage = computed(() => {
    const atlas = this.atlas();
    return atlas ? coverageRows(atlas) : [];
  });
  /** "X structural candidates; Y% never had stiffness calculated" (the moduli-blind population). */
  protected readonly candidateSummary = computed(() => {
    const atlas = this.atlas();
    return atlas ? candidateCoverage(atlas) : null;
  });
  protected readonly rules = computed(() => {
    const rules = this.atlas()?.meta.rules ?? {};
    return RULE_ORDER.filter((k) => rules[k]).map((k) => ({
      label: RULE_LABELS[k] ?? categoryLabel(k),
      help: CATEGORY_HELP[k] ?? null,
      text: rules[k],
    }));
  });
  protected readonly hoverDetail = computed(() => this.detailFor(this.hovered()));
  protected readonly selectedDetail = computed(() => this.detailFor(this.selected()));

  private ctx: CanvasRenderingContext2D | null = null;
  private size = { width: 0, height: 0, dpr: 1 };
  private transform: ZoomTransform = zoomIdentity;
  private zoomBehavior?: ZoomBehavior<SVGSVGElement, unknown>;
  /** Point positions in "world" pixels (fit to the plot at zoom 1). */
  private wx = new Float32Array(0);
  private wy = new Float32Array(0);
  /** Quantized data coordinates -> world pixels: world = offset + value * scale. */
  private toWorld = { ox: 0, oy: 0, scale: 1 };
  private layers?: Record<
    'contours' | 'regions' | 'anchors',
    Selection<SVGGElement, unknown, null, undefined>
  >;
  private tree?: Quadtree<number>;
  private frame = 0;
  private resizeObserver?: ResizeObserver;

  constructor() {
    afterNextRender(() => this.setup());
    void this.load();

    // Overlay or visibility changed: rebuild the hit-test index and redraw.
    effect(() => {
      this.groups();
      this.hidden();
      untracked(() => {
        this.buildTree();
        this.drawContours();
        this.scheduleDraw();
      });
    });
    effect(() => {
      this.showContours();
      untracked(() => this.drawContours());
    });
    effect(() => {
      this.showRegions();
      this.regions();
      untracked(() => this.scheduleDraw());
    });
    effect(() => {
      this.hovered();
      this.selected();
      this.filterMask();
      this.similarAnchor();
      untracked(() => this.scheduleDraw());
    });
  }

  ngOnDestroy(): void {
    this.resizeObserver?.disconnect();
    cancelAnimationFrame(this.frame);
  }

  protected setOverlay(id: OverlayId): void {
    this.overlayId.set(id);
    this.hidden.set(new Set());
  }

  protected toggleGroup(key: string): void {
    const next = new Set(this.hidden());
    if (!next.delete(key)) next.add(key);
    this.hidden.set(next);
  }

  protected showAll(): void {
    this.hidden.set(new Set());
  }

  protected resetZoom(): void {
    if (this.zoomBehavior)
      select(this.svgRef().nativeElement).call(this.zoomBehavior.transform, zoomIdentity);
  }

  protected selectAnchor(index: number): void {
    this.selected.set(index);
    this.similarFor.set(index);
  }

  /** Select a point; selecting an anchor also opens its similar-materials panel. */
  private selectPoint(i: number | null): void {
    this.selected.set(i);
    if (i !== null && this.atlas()?.anchors.some((a) => a.index === i)) this.similarFor.set(i);
  }

  private async load(): Promise<void> {
    try {
      const res = await fetch(DATA_URL);
      if (!res.ok) {
        this.state.set('missing');
        return;
      }
      this.atlas.set((await res.json()) as Atlas);
      this.state.set('ready');
      this.layout();
    } catch {
      this.state.set('error');
    }
  }

  private detailFor(i: number | null) {
    const atlas = this.atlas();
    return atlas && i !== null ? materialDetail(atlas, i) : null;
  }

  private setup(): void {
    const svg = this.svgRef().nativeElement;
    this.ctx = this.canvasRef().nativeElement.getContext('2d');

    this.zoomBehavior = zoom<SVGSVGElement, unknown>()
      .scaleExtent([1, 60])
      .on('zoom', (event: { transform: ZoomTransform }) => {
        this.transform = event.transform;
        this.hovered.set(null);
        this.scheduleDraw();
      });
    select(svg).call(this.zoomBehavior);
    // Bottom to top: contours, region labels, anchors.
    this.layers = {
      contours: select(svg).append('g').attr('class', 'contours'),
      regions: select(svg).append('g').attr('class', 'regions'),
      anchors: select(svg).append('g').attr('class', 'anchors'),
    };

    svg.addEventListener('pointermove', (e) => {
      const i = this.pick(e);
      this.hovered.set(i);
      if (i !== null) {
        const flip = e.offsetX > this.size.width - 240;
        this.tooltipAt.set({ x: e.offsetX, y: e.offsetY, flip });
      }
    });
    svg.addEventListener('pointerleave', () => this.hovered.set(null));
    svg.addEventListener('click', (e) => this.selectPoint(this.pick(e)));

    this.resizeObserver = new ResizeObserver(() => this.layout());
    this.resizeObserver.observe(this.plotRef().nativeElement);
    this.layout();
  }

  /** Size the canvas to the plot and fit the data into it. */
  private layout(): void {
    const atlas = this.atlas();
    const plot = this.plotRef().nativeElement;
    const canvas = this.canvasRef().nativeElement;
    const dpr = window.devicePixelRatio || 1;
    const width = plot.clientWidth;
    const height = plot.clientHeight;
    if (!width || !height) return;

    this.size = { width, height, dpr };
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    this.zoomBehavior?.extent([
      [0, 0],
      [width, height],
    ]);

    if (atlas) {
      const { x, y } = atlas.columns;
      // reduce, not Math.max(...x): spreading ~150k arguments overflows the call stack.
      const xMax = x.reduce((m, v) => Math.max(m, v), 1);
      const yMax = y.reduce((m, v) => Math.max(m, v), 1);
      const scale = Math.min((width - 2 * PADDING) / xMax, (height - 2 * PADDING) / yMax);
      const ox = (width - xMax * scale) / 2;
      const oy = (height - yMax * scale) / 2;
      this.toWorld = { ox, oy, scale };
      this.wx = Float32Array.from(x, (v) => ox + v * scale);
      this.wy = Float32Array.from(y, (v) => oy + v * scale);
      this.buildTree();
      this.drawContours();
    }
    this.scheduleDraw();
  }

  private buildTree(): void {
    if (this.wx.length === 0) return;
    const hidden = this.hidden();
    const visible = this.groups().flatMap((g) => (hidden.has(g.key) ? [] : g.indices));
    this.tree = quadtree<number>()
      .x((i) => this.wx[i])
      .y((i) => this.wy[i])
      .addAll(visible);
  }

  private pick(e: MouseEvent): number | null {
    if (!this.tree) return null;
    const [x, y] = this.transform.invert([e.offsetX, e.offsetY]);
    return this.tree.find(x, y, HOVER_RADIUS / this.transform.k) ?? null;
  }

  private scheduleDraw(): void {
    if (typeof requestAnimationFrame === 'undefined') return;
    cancelAnimationFrame(this.frame);
    this.frame = requestAnimationFrame(() => this.draw());
  }

  private draw(): void {
    const ctx = this.ctx;
    const { width, height, dpr } = this.size;
    if (!ctx || !width) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);
    this.layers?.contours.attr('transform', this.transform.toString());
    this.drawRegions(this.drawAnchors());
    if (this.wx.length === 0) return;

    const t = this.transform;
    const hidden = this.hidden();
    const r = Math.min(4, Math.max(1.1, 1.1 * Math.sqrt(t.k)));
    // Largest groups first so small groups sit on top instead of being buried.
    const order = [...this.groups()].sort((a, b) => b.indices.length - a.indices.length);

    const mask = this.filterMask();
    const visible = order.filter((g) => !hidden.has(g.key));
    if (mask) {
      // Points outside the brushed profile recede to a neutral so the matching set stands out.
      ctx.globalAlpha = 0.35;
      for (const g of visible) this.drawGroup(ctx, g.indices, FILTERED_OUT, t, r, (i) => !mask[i]);
    }
    ctx.globalAlpha = 0.8;
    // Brushed matches are often sparse, so they draw a size up to stay findable.
    const matchR = mask ? r + 1 : r;
    for (const g of visible) {
      this.drawGroup(ctx, g.indices, g.color, t, matchR, mask ? (i) => mask[i] === 1 : undefined);
    }
    ctx.globalAlpha = 1;

    // Neighbors of the open "similar" anchor: thin rings, so they stay findable at any zoom.
    const neighbors = this.similarAnchor()?.similar ?? [];
    if (neighbors.length) {
      ctx.beginPath();
      for (const i of neighbors) {
        const [x, y] = t.apply([this.wx[i], this.wy[i]]);
        ctx.moveTo(x + r + 2.5, y);
        ctx.arc(x, y, r + 2.5, 0, 2 * Math.PI);
      }
      ctx.lineWidth = 1.25;
      ctx.strokeStyle = '#cbd5e1';
      ctx.stroke();
    }

    for (const i of [this.selected(), this.hovered()]) {
      if (i === null) continue;
      const [x, y] = t.apply([this.wx[i], this.wy[i]]);
      ctx.beginPath();
      ctx.arc(x, y, r + 4, 0, 2 * Math.PI);
      ctx.lineWidth = 2;
      ctx.strokeStyle = '#f8fafc';
      ctx.stroke();
    }
  }

  private drawGroup(
    ctx: CanvasRenderingContext2D,
    indices: number[],
    color: string,
    t: ZoomTransform,
    r: number,
    include?: (i: number) => boolean,
  ): void {
    const { width, height } = this.size;
    ctx.fillStyle = color;
    const useRects = r < 1.6; // at small sizes squares are indistinguishable and much cheaper
    if (!useRects) ctx.beginPath();
    for (const i of indices) {
      if (include && !include(i)) continue;
      const x = t.x + t.k * this.wx[i];
      const y = t.y + t.k * this.wy[i];
      if (x < -r || y < -r || x > width + r || y > height + r) continue;
      if (useRects) {
        ctx.fillRect(x - r, y - r, 2 * r, 2 * r);
      } else {
        ctx.moveTo(x + r, y);
        ctx.arc(x, y, r, 0, 2 * Math.PI);
      }
    }
    if (!useRects) ctx.fill();
  }

  /**
   * Construction-material anchors: ringed markers with greedy collision-avoiding labels.
   * Returns the screen boxes they occupy so region labels can stay clear of them.
   */
  private drawAnchors(): { x: number; y: number; w: number }[] {
    const atlas = this.atlas();
    const anchors = atlas && this.wx.length ? atlas.anchors : [];
    const t = this.transform;
    const LABEL_H = 16;
    const projected = anchors.map((a) => {
      const [x, y] = t.apply([this.wx[a.index], this.wy[a.index]]);
      return { ...a, x, y };
    });
    // Boxes already taken; seeded with the marker rings so labels never cover another anchor.
    const placed = projected.map((a) => ({ x: a.x - 8, y: a.y + 4, w: 16 }));

    const positions = projected
      .sort((a, b) => a.y - b.y)
      .map((a) => {
        const w = a.name.length * 7.2 + 4;
        // Try right, left, then nudge downward until the label clears earlier ones.
        const candidates = [0, 1, 2, 3].flatMap((step) => [
          { lx: a.x + 10, ly: a.y + 4 + step * LABEL_H, anchor: 'start' },
          { lx: a.x - 10, ly: a.y + 4 + step * LABEL_H, anchor: 'end' },
        ]);
        const fits = (c: (typeof candidates)[number]) => {
          const left = c.anchor === 'start' ? c.lx : c.lx - w;
          const inside = left >= 2 && left + w <= this.size.width - 2;
          return (
            inside &&
            placed.every(
              (p) => left + w < p.x || left > p.x + p.w || Math.abs(c.ly - p.y) >= LABEL_H,
            )
          );
        };
        const spot = candidates.find(fits) ?? candidates[0];
        placed.push({ x: spot.anchor === 'start' ? spot.lx : spot.lx - w, y: spot.ly, w });
        return { ...a, ...spot };
      });

    if (!this.layers) return placed;
    const g = this.layers.anchors
      .selectAll<SVGGElement, (typeof positions)[number]>('g.anchor')
      .data(positions, (d) => d.material_id)
      .join((enter) => {
        const e = enter.append('g').attr('class', 'anchor');
        e.append('circle').attr('r', 6);
        e.append('line');
        e.append('text');
        return e;
      });
    g.select('circle')
      .attr('cx', (d) => d.x)
      .attr('cy', (d) => d.y);
    g.select('line')
      .attr('x1', (d) => d.x + (d.anchor === 'start' ? 6 : -6))
      .attr('y1', (d) => d.y)
      .attr('x2', (d) => d.lx + (d.anchor === 'start' ? -2 : 2))
      .attr('y2', (d) => d.ly - 4);
    g.select('text')
      .attr('x', (d) => d.lx)
      .attr('y', (d) => d.ly)
      .attr('text-anchor', (d) => d.anchor)
      .text((d) => d.name);
    return placed;
  }

  /** Island names, largest first, shown once an island is big enough on screen and clear of anchors. */
  private drawRegions(taken: { x: number; y: number; w: number }[]): void {
    if (!this.layers) return;
    const { ox, oy, scale } = this.toWorld;
    const t = this.transform;
    const { width, height } = this.size;
    const LABEL_H = 14;
    const placed = [...taken];
    const visible = (this.showRegions() && this.wx.length ? this.regions() : []).flatMap((r) => {
      if (Math.max(r.width, r.height) * scale * t.k < REGION_MIN_PX) return [];
      const [x, y] = t.apply([ox + r.x * scale, oy + r.y * scale]);
      const w = r.label.length * 7.4 + 8;
      const box = { x: x - w / 2, y, w };
      const clear = placed.every(
        (p) => box.x + w < p.x || box.x > p.x + p.w || Math.abs(y - p.y) >= LABEL_H,
      );
      if (!clear || box.x < 2 || box.x + w > width - 2 || y < LABEL_H || y > height - 4) return [];
      placed.push(box);
      return [{ ...r, sx: x, sy: y }];
    });

    this.layers.regions
      .selectAll<SVGTextElement, (typeof visible)[number]>('text')
      .data(visible, (d) => `${d.label}@${d.x},${d.y}`)
      .join('text')
      .attr('class', 'region-label')
      .attr('x', (d) => d.sx)
      .attr('y', (d) => d.sy)
      .text((d) => d.label);
  }

  /** Density contours of the visible points, in world coordinates (zoom just transforms them). */
  private drawContours(): void {
    if (!this.layers) return;
    const { width, height } = this.size;
    const hidden = this.hidden();
    const indices =
      this.showContours() && this.wx.length && width
        ? this.groups().flatMap((g) => (hidden.has(g.key) ? [] : g.indices))
        : [];
    let levels: ContourMultiPolygon[] = [];
    if (indices.length) {
      const estimator = contourDensity<number>()
        .x((i) => this.wx[i])
        .y((i) => this.wy[i])
        .size([width, height])
        .bandwidth(CONTOUR_BANDWIDTH) as ContourDensityV4;
      // One density pass, then contours at fractions of its peak (thresholds aren't known upfront).
      const density = estimator.contours(indices);
      levels = CONTOUR_LEVELS.map((f) => density(density.max * f));
    }
    this.layers.contours
      .selectAll('path')
      .data(levels)
      .join('path')
      .attr('class', (_, k) => `contour level-${k}`)
      .attr('d', geoPath());
  }
}
