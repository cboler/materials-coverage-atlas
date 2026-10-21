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

### Phase 2: structural means structural

- Supply gate on both structural paths: element cost ≤ $100/kg and every element ≥ 10 ppm
  (unknown fails). Split: metallic/alloy = band gap 0 and nonmetals < 50% of atoms; else
  mineral/ceramic. Candidate alloys must also have a metallic composition.
- Movement, applied in order (flagged structural / candidates):
  - A. supply gate on the verified path: −5,084 / 0 (verified 6,886 → 1,802; removed entries
    are mostly rare-earth and precious-metal intermetallics such as Si3Ru4, YTaRu2, Pd17Se15)
  - B. cost cap on the candidate rule: −565 / −611
  - C. metallic composition for candidate alloys: −31 / −55
- Primary: structural 10,915 → 5,744 (metallic 987, ceramic 4,757); 4,422 go to unclassified
  and 749 to electronic/optical. Flagged: metallic 1,212 (712 verified, 500 inferred), ceramic
  5,962 (1,090 verified, 4,872 inferred). Candidates 5,929, 90.3% never calculated.
- Casualties of one documented threshold: W and Mo (≈1.2 ppm) fail the floor, so WC is
  unclassified; magnesium misses the 25 GPa shear cut (24.4 GPa in MP).
- Measured but not applied: Pugh's ratio (K/G ≥ 1.75) would remove 497 of 1,108 gated metallic
  entries, including a copper polymorph and MAX phases.
- Colors: metallic `#3987e5` (slot 1), ceramic `#9ec5f4` (blue step 200). The validator passes
  that pair and step 200 against every other slot (CVD ΔE ≥ 19, normal ≥ 20); the only failing
  all-pairs pair is the pre-existing energy/magnetic orange–yellow.

### Phase 3: coloring order

- Chose reordering over a multi-category ring: 20,220 of 65,888 classified materials match
  several rules, so rings would mark a third of the map. Only structural metals move ahead of
  magnetic (ADR-010): 225 entries recolor (205 magnetic → metallic, 20 energy → metallic).
  All-structural-first would recolor 1,430 (1,143 energy cathodes/absorbers → ceramic).
- Anchors: iron and aluminum → structural metallic; calcite, gypsum, alite, belite, quartz,
  corundum → structural ceramic; portlandite stays unclassified (soft measured moduli) but is
  a structural candidate.

### Phase 4: electrode precision/recall

- Endpoint: `mpr.materials.insertion_electrodes` (route `materials/insertion_electrodes`). Its
  full dataset is the Delta table `s3://materialsproject-build/collections/insertion-electrodes`,
  partitioned by version; read anonymously with `deltalake` (`fetch.load_open_data`).
- 6,847 electrodes (Li 2,774, Mg 1,968, Ca 625, Zn 434, Na 416, K 164, Y 159, Al 143, Rb 83,
  Cs 81). Positives: 11,698 intercalated states for Li/Na/K/Mg/Zn electrodes; 4,154 within the
  rule's 0.05 eV/atom window. Negatives (approximate): 16,646 compounds in the window that
  contain a working ion, are in no electrode, and whose ion-free framework is no electrode host.
- Recall 0.863 in the window (0.306 over all positives); precision 0.499; 21.6% of negatives
  flagged. Typical misses: no listed redox metal (Sb, Sn, Tl, Re), spectator Sr/Ba, alloys.
  Typical "false positives" look like real cathode chemistries (Li–Mn–Co–O, Li–Ti–Cr–O).

## 4. Implementation Steps

- [x] **Phase 1**: candidate rule, verified/inferred split in legend, card and table.
- [x] **Phase 2**: metallic vs mineral/ceramic split, cost/abundance gate on the verified path.
- [x] **Phase 3**: coloring order / multi-membership.
- [x] **Phase 4**: electrode precision/recall against MP insertion electrodes.
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
