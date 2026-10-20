import {
  Component,
  ElementRef,
  OnDestroy,
  afterNextRender,
  computed,
  effect,
  input,
  output,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { brushY, select, type BrushBehavior, type D3BrushEvent, type Selection } from 'd3';
import { Atlas, Group } from './atlas-data';
import {
  AxisBrush,
  MISSING_T,
  ParallelAxis,
  T_MAX,
  T_MIN,
  UNPHYSICAL_T,
  buildAxes,
  filterMask,
} from './parallel-data';

const MARGIN = { top: 44, right: 64, bottom: 10, left: 56 };
// Canvas cost grows with lines x axes; past these caps lines are a random sample (disclosed in the UI).
const LINE_CAP = 12000;
const CONTEXT_CAP = 4000;
const CONTEXT_COLOR = '#4b5563';

@Component({
  selector: 'app-parallel-coordinates',
  standalone: true,
  imports: [DecimalPipe],
  templateUrl: './parallel-coordinates.component.html',
  styleUrl: './parallel-coordinates.component.scss',
})
export class ParallelCoordinatesComponent implements OnDestroy {
  readonly atlas = input.required<Atlas>();
  readonly groups = input.required<Group[]>();
  readonly hidden = input.required<ReadonlySet<string>>();
  /** Emits the brushed-material mask (1 = matches), or null when no axis is brushed. */
  readonly filterChange = output<Uint8Array | null>();

  private readonly plotRef = viewChild.required<ElementRef<HTMLDivElement>>('plot');
  private readonly canvasRef = viewChild.required<ElementRef<HTMLCanvasElement>>('canvas');
  private readonly svgRef = viewChild.required<ElementRef<SVGSVGElement>>('svg');

  protected readonly axes = computed(() => buildAxes(this.atlas()));
  private readonly brushes = signal<ReadonlyMap<string, AxisBrush>>(new Map());
  private readonly mask = computed(() => filterMask(this.axes(), this.brushes()));
  /** Group index per material (for color), or -1 when its legend group is hidden. */
  private readonly groupOf = computed(() => {
    const hidden = this.hidden();
    const groupOf = new Int16Array(this.atlas().columns.id.length).fill(-1);
    this.groups().forEach((g, gi) => {
      if (!hidden.has(g.key)) for (const i of g.indices) groupOf[i] = gi;
    });
    return groupOf;
  });
  /** Stable shuffled draw order, so sampled lines don't flicker between redraws. */
  private readonly order = computed(() => shuffledIndices(this.atlas().columns.id.length));

  protected readonly filtered = computed(() => this.brushes().size > 0);
  protected readonly visibleCount = computed(() => count(this.groupOf(), null));
  protected readonly matchCount = computed(() => count(this.groupOf(), this.mask()));
  protected readonly drawn = signal(0);

  private ctx: CanvasRenderingContext2D | null = null;
  private size = { width: 0, height: 0, dpr: 1, axisH: 0 };
  private brushBehaviors = new Map<string, BrushBehavior<unknown>>();
  private frame = 0;
  private resizeObserver?: ResizeObserver;

  constructor() {
    afterNextRender(() => {
      this.ctx = this.canvasRef().nativeElement.getContext('2d');
      this.resizeObserver = new ResizeObserver(() => this.layout());
      this.resizeObserver.observe(this.plotRef().nativeElement);
      this.layout();
    });
    effect(() => {
      this.groupOf();
      this.mask();
      untracked(() => this.scheduleDraw());
    });
  }

  ngOnDestroy(): void {
    this.resizeObserver?.disconnect();
    cancelAnimationFrame(this.frame);
  }

  protected clearFilters(): void {
    const svg = select(this.svgRef().nativeElement);
    for (const [key, behavior] of this.brushBehaviors) {
      svg.select<SVGGElement>(`g.brush[data-key="${key}"]`).call(behavior.move, null);
    }
    this.setBrushes(new Map());
  }

  private setBrushes(next: ReadonlyMap<string, AxisBrush>): void {
    this.brushes.set(next);
    this.filterChange.emit(this.mask());
  }

  private x(k: number): number {
    const span = this.size.width - MARGIN.left - MARGIN.right;
    return MARGIN.left + (k * span) / (this.axes().length - 1);
  }

  private y(t: number): number {
    return MARGIN.top + (T_MAX - t) * this.size.axisH;
  }

  private tOf(y: number): number {
    return T_MAX - (y - MARGIN.top) / this.size.axisH;
  }

  /** Size the canvas and rebuild axes, ticks and brushes for the current width. */
  private layout(): void {
    const plot = this.plotRef().nativeElement;
    const canvas = this.canvasRef().nativeElement;
    const width = plot.clientWidth;
    const height = plot.clientHeight;
    if (!width || !height) return;
    const dpr = window.devicePixelRatio || 1;
    // The axis plus both slots must fit: the t range [T_MIN, T_MAX] spans the plot height.
    const axisH = (height - MARGIN.top - MARGIN.bottom) / (T_MAX - T_MIN);
    this.size = { width, height, dpr, axisH };
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;

    const svg = select(this.svgRef().nativeElement);
    svg.selectAll('*').remove();
    this.brushBehaviors.clear();
    this.axes().forEach((axis, k) => this.renderAxis(svg.append('g'), axis, this.x(k)));
    this.scheduleDraw();
  }

  private renderAxis(
    g: Selection<SVGGElement, unknown, null, undefined>,
    axis: ParallelAxis,
    x: number,
  ): void {
    g.attr('class', 'pc-axis').attr('transform', `translate(${x},0)`);
    const [name, unit] = axis.label.split(' (');
    const title = g
      .append('text')
      .attr('class', 'pc-title')
      .attr('y', MARGIN.top - 24);
    title.append('tspan').attr('x', 0).text(name);
    if (unit)
      title.append('tspan').attr('x', 0).attr('dy', 13).attr('class', 'pc-unit').text(`(${unit}`);

    g.append('line').attr('class', 'pc-line').attr('y1', this.y(0)).attr('y2', this.y(1));
    for (const tick of axis.ticks) {
      const ty = this.y(tick.t);
      g.append('line').attr('class', 'pc-tick').attr('x1', -4).attr('y1', ty).attr('y2', ty);
      g.append('text')
        // Category names are long, so they sit right of the axis (haloed over the lines).
        .attr('class', axis.kind === 'category' ? 'pc-level' : 'pc-tick-label')
        .attr('x', axis.kind === 'category' ? 7 : -7)
        .attr('y', ty)
        .attr('dy', '0.32em')
        .text(tick.label);
    }
    const slots = [
      { show: axis.hasMissing, t: MISSING_T, label: 'no data' },
      { show: axis.hasUnphysical, t: UNPHYSICAL_T, label: 'unphysical' },
    ];
    for (const slot of slots.filter((s) => s.show)) {
      const sy = this.y(slot.t);
      g.append('line')
        .attr('class', 'pc-slot')
        .attr('y1', sy - 8)
        .attr('y2', sy + 8);
      g.append('text')
        .attr('class', 'pc-tick-label')
        .attr('x', -7)
        .attr('y', sy)
        .attr('dy', '0.32em')
        .text(slot.label);
    }

    const behavior = brushY<unknown>()
      .extent([
        [-12, this.y(axis.hasUnphysical ? T_MAX : 1) - 4],
        [12, this.y(axis.hasMissing ? T_MIN : 0) + 4],
      ])
      .on('brush end', (event: D3BrushEvent<unknown>) => {
        if (!event.sourceEvent) return; // programmatic move (layout or clear)
        const next = new Map(this.brushes());
        const sel = event.selection as [number, number] | null;
        if (sel) next.set(axis.key, { lo: this.tOf(sel[1]), hi: this.tOf(sel[0]) });
        else next.delete(axis.key);
        this.setBrushes(next);
      });
    const brushG = g.append('g').attr('class', 'brush').attr('data-key', axis.key).call(behavior);
    this.brushBehaviors.set(axis.key, behavior);
    const existing = this.brushes().get(axis.key);
    if (existing) brushG.call(behavior.move, [this.y(existing.hi), this.y(existing.lo)]);
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

    const axes = this.axes();
    const groups = this.groups();
    const groupOf = this.groupOf();
    const mask = this.mask();
    const selected: number[][] = groups.map(() => []);
    const context: number[] = [];
    let drawn = 0;
    for (const i of this.order()) {
      const g = groupOf[i];
      if (g < 0) continue;
      if (mask && !mask[i]) {
        if (context.length < CONTEXT_CAP) context.push(i);
      } else if (drawn < LINE_CAP) {
        selected[g].push(i);
        drawn++;
      }
      if (drawn >= LINE_CAP && (!mask || context.length >= CONTEXT_CAP)) break;
    }
    this.drawn.set(drawn);

    const xs = axes.map((_, k) => this.x(k));
    const stroke = (indices: number[], color: string, alpha: number) => {
      if (!indices.length) return;
      ctx.globalAlpha = alpha;
      ctx.strokeStyle = color;
      ctx.beginPath();
      for (const i of indices) {
        ctx.moveTo(xs[0], this.y(axes[0].positions[i]));
        for (let k = 1; k < axes.length; k++) ctx.lineTo(xs[k], this.y(axes[k].positions[i]));
      }
      ctx.stroke();
    };

    ctx.lineWidth = 1;
    stroke(context, CONTEXT_COLOR, 0.08);
    // Fewer lines can be more opaque without saturating into a solid block.
    const alpha = Math.min(0.6, Math.max(0.12, 1000 / Math.max(drawn, 1)));
    // Largest groups first so small groups stay visible on top, matching the map.
    [...groups.keys()]
      .sort((a, b) => selected[b].length - selected[a].length)
      .forEach((g) => stroke(selected[g], groups[g].color, alpha));
    ctx.globalAlpha = 1;
  }
}

function count(groupOf: Int16Array, mask: Uint8Array | null): number {
  let n = 0;
  for (let i = 0; i < groupOf.length; i++) if (groupOf[i] >= 0 && (!mask || mask[i])) n++;
  return n;
}

/** Fisher-Yates with a fixed-seed mulberry32 PRNG: random-looking but identical every load. */
function shuffledIndices(n: number): Uint32Array {
  const order = Uint32Array.from({ length: n }, (_, i) => i);
  let seed = 0x9e3779b9;
  const random = () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 2 ** 32;
  };
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  return order;
}
