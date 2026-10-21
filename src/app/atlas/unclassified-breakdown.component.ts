import { Component, input, output } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { ReasonRow } from './atlas-data';

/** Why the unclassified materials fit no rule: one clickable bar per reason. */
@Component({
  selector: 'app-unclassified-breakdown',
  standalone: true,
  imports: [DecimalPipe],
  templateUrl: './unclassified-breakdown.component.html',
  styleUrl: './unclassified-breakdown.component.scss',
})
export class UnclassifiedBreakdownComponent {
  readonly rows = input.required<ReasonRow[]>();
  /** Key of the reason highlighted on the map, if any. */
  readonly active = input<string | null>(null);
  /** A bar was clicked: the parent highlights (or clears) that reason. */
  readonly pick = output<string>();
}
