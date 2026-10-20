import { Component, input } from '@angular/core';
import { DecimalPipe } from '@angular/common';

/** "How to read this map": what the dots are, where the data comes from, what position means. */
@Component({
  selector: 'app-atlas-guide',
  standalone: true,
  imports: [DecimalPipe],
  templateUrl: './atlas-guide.component.html',
  styleUrl: './atlas-guide.component.scss',
})
export class AtlasGuideComponent {
  /** Share of materials made in a lab, and with stiffness data (null until data loads). */
  readonly experimentalPct = input<number | null>(null);
  readonly elasticPct = input<number | null>(null);
  /** Open on wide screens; on phones start collapsed so the map isn't pushed a screen down. */
  protected readonly startOpen =
    typeof window === 'undefined' ||
    !window.matchMedia ||
    window.matchMedia('(min-width: 720px)').matches;
}
