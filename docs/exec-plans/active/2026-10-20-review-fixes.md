# Execution Plan: Review fixes and coverage features

- **Date**: 2026-10-20
- **Status**: In Progress
- **Owner**: Claude (agent)

## 1. Goal & Objectives

Act on an external review of the atlas: fix the circular structural coverage metric, make
"structural" mean structural, fix the coloring order, measure electrode-rule precision/recall,
add provenance and extrapolation overlays, export a shareable figure, and fix property-profile
axis layout. One commit per phase, with tests for every rule change.

## 2. Context & Background

- Data: MP v2026.09.28, 154,377 non-deprecated materials in `pipeline/cache/summary.parquet`.
- No `MP_API_KEY` was available locally. Auxiliary MP collections (insertion electrodes,
  provenance) were read from MP's public AWS Open Data bucket (`materialsproject-build`),
  the same unsigned S3 path mp-api's bulk download uses, pinned to the summary's version.

## 3. Proposed Changes and Results

### Phase 1: non-circular structural coverage

- `categories.structural_candidate()`: moduli-blind rule (hull ≤ 0.05 eV/atom, every element
  ≥ 10 ppm, and either gap ≥ 3 eV with O, or metallic and made of structural metals plus
  C/Si/B/N with at least one of Fe/Al/Ti/Mg/Cu/Ni).
- Inferred structural = candidate and no _usable_ (physical) elastic data. Unphysical fits used
  to block inference; aluminum (mp-134, G_VRH = −14 GPa) was unclassified.
- Effect: 421 materials move to structural (419 from unclassified, 2 from electronic/optical).
  Structural primary 10,494 → 10,915; inferred 5,403 → 5,968 flagged.
- Coverage: 6,595 structural candidates, 9.8% with stiffness data (90.2% never calculated).
  Primary-category stiffness shares: electronic/optical 3.2%, energy 4.7%, magnetic 3.4%,
  unclassified 5.6%, all 8.4%; structural 56.4% (built in, marked †).

## 4. Implementation Steps

- [x] **Phase 1**: candidate rule, verified/inferred split in legend, card and table.
- [ ] **Phase 2**: metallic vs mineral/ceramic split, cost/abundance gate on the verified path.
- [ ] **Phase 3**: coloring order / multi-membership.
- [ ] **Phase 4**: electrode precision/recall against MP insertion electrodes.
- [ ] **Phase 5**: provenance overlay (newer entries: sparse vs crowded regions).
- [ ] **Phase 6**: extrapolation-distance overlay.
- [ ] **Phase 7**: shareable figure.
- [ ] **Phase 8**: property-profile axis layout, MP link check.

## 5. Verification Plan

- [ ] `pytest pipeline`, `npm test`, `npm run lint`, `npm run format:check`, `npm run e2e`
- [ ] Browser check at phone, 800 px, tablet and desktop widths

## 6. Risks, Ceilings & Rollback

- **Ceiling**: rules are screening heuristics; thresholds are documented in
  `pipeline/categories.py`.
- **Rollback**: each phase is its own commit.
