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
import { ParallelCoordinatesComponent } from './parallel-coordinates.component';
import {
  quadtree,
  select,
  zoom,
  zoomIdentity,
  type Quadtree,
  type ZoomBehavior,
  type ZoomTransform,
} from 'd3';
import {
  Atlas,
  OVERLAYS,
  OverlayId,
  buildGroups,
  categoryLabel,
  coverageRows,
  fmtNumber,
  materialDetail,
} from './atlas-data';

type LoadState = 'loading' | 'ready' | 'missing' | 'error';

const DATA_URL = 'data/atlas.json'; // relative: resolves against <base href> on GitHub Pages
const PADDING = 24;
const FILTERED_OUT = '#2b3343';
const HOVER_RADIUS = 10; // screen px; larger than the marks so small points are easy to hit
const RULE_ORDER = [
  'gate',
  'structural',
  'energy',
  'electronic_optical',
  'magnetic',
  'unclassified',
  'priority',
];

@Component({
  selector: 'app-atlas',
  standalone: true,
  imports: [DecimalPipe, ParallelCoordinatesComponent],
  templateUrl: './atlas.component.html',
  styleUrl: './atlas.component.scss',
})
export class AtlasComponent implements OnDestroy {
  private readonly plotRef = viewChild.required<ElementRef<HTMLDivElement>>('plot');
  private readonly canvasRef = viewChild.required<ElementRef<HTMLCanvasElement>>('canvas');
  private readonly svgRef = viewChild.required<ElementRef<SVGSVGElement>>('svg');

  protected readonly overlays = OVERLAYS;
  protected readonly fmt = fmtNumber;
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
  protected readonly rules = computed(() => {
    const rules = this.atlas()?.meta.rules ?? {};
    return RULE_ORDER.filter((k) => rules[k]).map((k) => ({
      label: k === 'gate' ? 'All categories' : k === 'priority' ? 'Coloring' : categoryLabel(k),
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
        this.scheduleDraw();
      });
    });
    effect(() => {
      this.hovered();
      this.selected();
      this.filterMask();
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

    svg.addEventListener('pointermove', (e) => {
      const i = this.pick(e);
      this.hovered.set(i);
      if (i !== null) {
        const flip = e.offsetX > this.size.width - 240;
        this.tooltipAt.set({ x: e.offsetX, y: e.offsetY, flip });
      }
    });
    svg.addEventListener('pointerleave', () => this.hovered.set(null));
    svg.addEventListener('click', (e) => this.selected.set(this.pick(e)));

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
      this.wx = Float32Array.from(x, (v) => ox + v * scale);
      this.wy = Float32Array.from(y, (v) => oy + v * scale);
      this.buildTree();
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
    this.drawAnchors();
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

  /** Construction-material anchors: ringed markers with greedy collision-avoiding labels. */
  private drawAnchors(): void {
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

    const g = select(this.svgRef().nativeElement)
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
  }
}
