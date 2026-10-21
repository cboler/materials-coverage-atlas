# Execution Plan: Why-unclassified breakdown

- **Date**: 2026-10-21
- **Status**: Completed
- **Owner**: Claude (agent)

## 1. Goal & Objectives

Split the 88,489 unclassified materials (57% of MP v2026.09.28) by what keeps each one out of
every category, so a reader can tell "one calculation away" from "thermodynamically out", and
light any group up on the map.

## 2. Context & Background

- The coverage table showed Unclassified as one row, explained only as "usually unstable, or
  missing the data needed to judge it".
- Rules live in `pipeline/categories.py` and need composition fields the atlas does not ship
  (nonmetal and working-ion fractions), so reasons are computed in the pipeline, not the browser.

## 3. Proposed Changes and Results

- `categories.unclassified_reasons`: one reason per unclassified material, the first that applies,
  ordered closest to qualifying first. "Would match" re-runs every rule with one property changed
  (energy above hull set to 0, or cost and abundance made to pass), so reasons follow the rules
  when thresholds move.
- `atlas.json`: `meta.unclassified_reasons` (keys) and `columns.unclassified_reason` (index, null
  for classified materials). File grows from 14.6 to 15.1 MB.
- UI: a "Why unclassified?" toggle on the Unclassified row opens one bar per reason (count, share,
  lab-made count, plain-language explanation) in its own component. Clicking a bar highlights
  those materials on the map (intersected with any property-profile brushes), with a Clear button
  on the map. The detail card gains a "Why unclassified" row.

Counts on MP v2026.09.28 (they sum to 88,489; categories unchanged):

| Reason                             |  Count | Made in a lab |
| :--------------------------------- | -----: | ------------: |
| One stiffness calculation away     |  5,428 |         1,890 |
| Held back only by stability        | 38,988 |         7,065 |
| Held back only by cost or scarcity |  6,208 |         3,969 |
| Calculated, too soft               |    384 |           276 |
| Stable, but no single fix          | 22,961 |        10,167 |
| Unstable, and fits no rule         | 14,520 |         2,156 |

- "One stiffness calculation away" is first because, for anything inside the 0.1 eV/atom gate
  with a passing supply check, physical moduli with G ≥ 25 GPa make it verified structural. It
  includes 0.05–0.1 eV/atom compounds the moduli-blind candidate rule rejects.
- Most "stability only" entries are semiconductors in the 0.1–4 eV window above the hull: the
  electronic/optical rule is broad, so stability is their only blocker.
- 4,085 of the "cost or scarcity" group have physical stiffness data: stiff precious-metal and
  rare-earth compounds the supply gate removes.
- Portlandite lands in "Calculated, too soft" (G = 21 GPa).

## 4. Implementation Steps

- [x] **Pipeline**: reason rule, constants and docstring in `categories.py`; column and meta in
      `build_atlas.py`; five pytest cases (one per bucket, classified materials, unphysical fits,
      ordering, two blockers).
- [x] **Data**: regenerated `atlas.json` from the cache (figure unchanged apart from SVG IDs, so
      it was left as committed).
- [x] **UI**: `unclassifiedBreakdown`, `reasonMask`, `intersectMasks` in `atlas-data.ts`; text in
      `explain.ts`; `UnclassifiedBreakdownComponent`; map highlight and note in `AtlasComponent`.

## 5. Verification Plan

- [x] `pytest pipeline` (38), `npm test` (56), `npm run lint`
- [x] `npm run format:check`: clean for changed files (`README.md` and
      `e2e/pinned-card.spec.ts` were already unformatted)
- [x] `npm run e2e`, including `e2e/unclassified-breakdown.spec.ts` on all four viewports
- [x] Browser check at 390 px and 1280 px: no horizontal overflow; bars stay inside the table
      where it scrolls sideways on phones (sticky, sized with container query units)

## 6. Risks, Ceilings & Rollback

- **Ceiling**: the bars light up the map only; the property profiles do not filter to a reason.
- **Ceiling**: `atlas.component.scss` was already over its 8 kB warning budget (8.6 kB); it is
  now 9.1 kB, with the bar styles in the new component.
- **Rollback**: older atlas files have no reason column; the toggle and detail row then do not
  appear, so reverting the data alone is safe.
