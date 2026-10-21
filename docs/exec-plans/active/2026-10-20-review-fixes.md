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

### Phase 5: provenance and newer entries

- Available per entry: `theoretical`; `database_IDs` (ICSD 51.7k, Pauling 15.9k); provenance
  `created_at`, authors, remarks, tags, `history` (structure sources: ICSD, Pauling, pymatgen
  substitution transforms ~7.3k, MIT JCMC ~3.1k); `builder_meta.batch_id` (batch of the current
  calculation, e.g. `vasp6-statics-jan2021`, not origin). No ML-origin field. The API heartbeat
  lists `gnome_r2scan_statics` as access-controlled; our pull equals the public non-deprecated
  count (154,377), so the atlas has no GNoME entries.
- `created_at`: 88% of entries sit on three bulk dates (2016-04-20, 2017-07-18, 2024-11-22);
  iron (mp-13) shows 2017. Too coarse; fell back to entry order from the old numeric ID
  (new IDs are base-26 with a = 0). Tier medians of `created_at` off the rebuild dates: < 1.0M
  → 2012, 1.0–1.5M → 2017, ≥ 1.5M → 2022.
- k-NN (k = 10, UMAP feature space): 13,441 newer entries; median distance to older 0.452 vs
  0.438 for older-to-older (20k sample); 12.8% beyond the older 75th percentile (25% expected).
  99.6% of newer entries are predicted-only.

### Phase 6: extrapolation overlay

- HistGradientBoostingRegressor (defaults) on the map features, target K_VRH, physical elastic
  entries only: 9,696 train / 2,425 test, MAE 11.2 GPa (median guess 59.0 GPa).
- Indicator: mean 10-NN distance to the elastic set. In ~100 dimensions distances bunch (median
  missing material sits at 1.04× the elastic set's median spacing), so bins use the elastic
  set's own leave-one-out spacing percentiles (50/90/99): 62,551 / 60,110 / 15,633 / 3,962.
- Test MAE by bin: 11.7 (n 1,176), 10.7 (975), 10.5 (242), 14.6 GPa (32). A random split keeps
  test rows in-distribution, so the far bins have few rows; error rises only in the last bin.
- Only the bin is shipped; predicted moduli are not written to the atlas.

### Phase 7: shareable figure

- `pipeline/figure.py` (matplotlib, light palette, 2400×1350 PNG + SVG) reads `atlas.json`,
  groups each anchor's neighbors by formula exactly like the app, and builds the headline from
  the counts. Rendered on every full build. Stamped with MP version, CC BY 4.0, and the atlas
  build date (not today's date, so unchanged data gives an unchanged file).
- Current headline: "Near iron, the base of steel, 8 of the 20 most similar compounds have
  computed stiffness; near portlandite, the binder in cement, only 2 do." Subtitle: 5,929
  structural candidates, 90% never calculated.

## 4. Implementation Steps

- [x] **Phase 1**: candidate rule, verified/inferred split in legend, card and table.
- [x] **Phase 2**: metallic vs mineral/ceramic split, cost/abundance gate on the verified path.
- [x] **Phase 3**: coloring order / multi-membership.
- [x] **Phase 4**: electrode precision/recall against MP insertion electrodes.
- [x] **Phase 5**: provenance overlay (newer entries: sparse vs crowded regions).
- [x] **Phase 6**: extrapolation-distance overlay.
- [x] **Phase 7**: shareable figure.
- [ ] **Phase 8**: property-profile axis layout, MP link check.

## 5. Verification Plan

- [ ] `pytest pipeline`, `npm test`, `npm run lint`, `npm run format:check`, `npm run e2e`
- [ ] Browser check at phone, 800 px, tablet and desktop widths

## 6. Risks, Ceilings & Rollback

- **Ceiling**: rules are screening heuristics; thresholds are documented in
  `pipeline/categories.py`.
- **Rollback**: each phase is its own commit.
