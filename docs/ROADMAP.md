# Project Roadmap

This document records the **Angular PWA Starter** baseline this project was derived from, and the **Materials Coverage Atlas** roadmap.

---

## Part 1: Starter Template Baseline

The foundational starter provides production-ready infrastructure out-of-the-box:

- [x] **Angular 22+ Standalone Baseline**: Modern Angular bootstrap, inject-based DI, and Signals reactivity.
- [x] **Service Worker & PWA Caching**: Pre-configured `@angular/service-worker` with `prefetch` and `lazy` asset groups.
- [x] **Automated GitHub Pages Deployment**: Fully automated GitHub Actions workflow with dynamic subpath `--base-href` resolution.
- [x] **SPA 404 Routing Fallback**: `scripts/prepare-pages.mjs` generating `404.html` from `index.html` to eliminate static host route refresh errors.
- [x] **Mobile-First Design System**: Vanilla SCSS design tokens, touch targets >= 44px, safe area insets, `:focus-visible` outlines, and zero horizontal scroll.
- [x] **Comprehensive Quality Gates**: Vitest unit testing, Playwright multi-viewport smoke tests, Angular ESLint, and Prettier formatting.
- [x] **Agent Documentation Suite**: `AGENTS.md`, `GEMINI.md`, `docs/ARCHITECTURE.md`, `docs/DECISIONS.md`, and execution plan templates.

---

## Part 2: Downstream Derivation Onboarding Checklist

When creating a new project from this template, complete the following customization tasks:

### 1. Rebrand Application Identity

- [x] Update `<title>`, `<meta name="description">`, and `<meta name="theme-color">` in `src/index.html`.
- [x] Update `title` signal in `src/app/app.ts`.
- [x] Update `name`, `short_name`, and `description` in `public/manifest.webmanifest`.

### 2. Replace Icons and Visual Assets

- [ ] Replace standard icons in `public/icons/` (72x72 through 512x512 PNGs, including maskable icon).
- [ ] Replace browser favicon in `public/favicon.ico`.

### 3. Replace Placeholder Views

- [x] Replace `src/app/home/` with your application's domain UI and primary views.
- [x] Removed `src/app/status/`, the nav, the install button and the network badge; the atlas is the only view (browsers offer install from the address bar).
- [x] Update route definitions in `src/app/app.routes.ts`.

### 4. Implement Domain State & Persistence

- [ ] Model domain types in `src/app/core/models/`.
- [ ] Implement state services in `src/app/core/services/` using Angular Signals.
- [ ] Add client-side persistence (e.g. `localStorage`, `IndexedDB`, or native Web APIs) if the application operates offline.

### 5. Configure Dynamic API Caching (If Applicable)

- [ ] If your application consumes external HTTP APIs, configure `dataGroups` in `ngsw-config.json` choosing appropriate cache strategies (`freshness` or `performance`).

### 6. Expand Test Suites

- [x] Add unit tests for new services and components in `src/app/**/*.spec.ts`.
- [x] Update `e2e/smoke.spec.ts` with domain-specific smoke assertions and critical user journeys.

---

## Part 3: Materials Coverage Atlas Roadmap

### Phase 1: Atlas MVP (shipped)

- [x] **Data pipeline**: mp-api pull with local cache, documented category rules, supply metrics, cached UMAP, construction anchors (`pipeline/`).
- [x] **Map**: canvas scatter with zoom, hover/tap details, five overlays, toggleable legend, labeled anchors, coverage table, rules panel.
- [x] **Property profiles**: parallel coordinates with brushing linked to the map, plus "no data" and "unphysical" slots (ADR-008).
- [x] **Data refresh workflow**: `Build Atlas Data` GitHub Action using the `MP_API_KEY` secret.

### Phase 2: Category rules revision (in progress, local)

Findings from the shipped data (MP v2026.09.28, 154,377 materials):

- About 7,500 stable insulators with band gaps above 4 eV and no elastic data are unclassified. They include gypsum (5.7 eV) and belite (4.45 eV). Construction-relevant oxides, silicates, carbonates and sulfates have no category.
- 77% of compounds containing Fe/Co/Ni/Mn/Cr/V are FM/FiM and only 5.4% AFM, because MP calculations are initialized ferromagnetic. The magnetic category is inflated.

- [x] Inferred-structural rule for stable, wide-gap, oxygen-bearing, earth-abundant compounds without elastic data (pattern 3). Gypsum, alite and belite become structural (inferred).
- [x] Magnetic rule counts only metallic FM/FiM and insulating ferrimagnets (pattern 4). The magnetic category goes from 32,613 to 14,833.
- [x] Narrow the battery-electrode rule. Once magnetic stopped outranking it, the old rule (any Li/Na/K/Mg/Zn + redox metal + gap > 0) put energy at 22,701, and it missed metallic electrodes such as LiNiO2 and LiTiS2. The new rule requires the working ion to be ≥ 5% of atoms, an O/F/S/P/Se/N framework, no Rb/Cs/Ca/Sr/Ba, and a hull distance ≤ 0.05 eV/atom, with any band gap. Battery matches go from 16,814 to 9,735, and it keeps all 19 reference electrodes checked (the old rule kept 15).
- [x] Regenerate `atlas.json` and review category counts and anchor assignments. Structural 10,494 (4,357 inferred), energy 16,871, electronic/optical 27,693, magnetic 14,833, unclassified 84,486.

### Phase 4: Review fixes (2026-10-20)

See `docs/exec-plans/completed/2026-10-20-review-fixes.md` for the numbers behind each step.

- [x] **Non-circular structural coverage**: a moduli-blind structural-candidate rule (stable, earth-abundant, wide-gap oxide or structural-metal alloy). 6,595 candidates; 9.8% have stiffness data (90.2% never calculated), against 3.2–5.6% in the other categories. The structural row's 56.4% is marked as built in. Unphysical elastic fits (aluminum's G = −14 GPa) now count as "no usable data" and fall back to the candidate rule (+421 structural).
- [x] **Structural means structural**: split into metallic/alloy and mineral/ceramic (metallic = band gap 0 and nonmetals < 50% of atoms), and a supply gate (cost ≤ $100/kg, every element ≥ 10 ppm) on both paths. The verified-path gate removes 5,084, the candidate cost cap 565, the alloy-composition test 31. Primary structural 10,915 → 5,744 (987 metallic, 4,757 ceramic); candidates 6,595 → 5,929 (90.3% never calculated).
- [x] **Coloring order**: structural metals now rank ahead of magnetic (ADR-010), so iron and aluminum color as structural; 225 entries move (205 from magnetic, 20 from energy). The legend notes that 20,220 materials match several categories.
- [x] **Electrode rule precision/recall** against MP's 6,847 insertion electrodes (public open-data Delta table, no API key): recall 0.86 within the 0.05 eV/atom window (3,584 of 4,154), 0.31 over all 11,698 intercalated states; precision 0.50 against 16,646 approximate negatives. Shown under Category rules and stored in `meta.validation`.
- [x] **Newer entries overlay**: no public ML-origin marker (GNoME is the access-controlled `gnome_r2scan_statics` batch); `created_at` is 88% bulk-rebuild stamps, so entry order comes from the old numeric ID (tier medians: 2012, 2017, 2022). 13,441 entries added ~2020 onward: median 10-NN distance to older entries 0.452 vs 0.438 among older; 12.8% in sparse regions vs 25% expected. They mostly crowd existing clusters.
- [x] **Extrapolation overlay**: HistGradientBoosting K_VRH model on 12,121 materials with physical elastic data (MAE 11.2 GPa on 2,425 held out; 59.0 GPa for the median). Materials without usable data are binned by mean 10-NN distance to the elastic set, against that set's own 50th/90th/99th percentile spacing: 62,551 close, 60,110 moderately far, 15,633 far, 3,962 very far. Predicted moduli are never shipped.

### Phase 3: Orientation and discovery

Proposed after a review of recent visualization work (Embedding Atlas, PixelatedScatter, OptiMate). See ADR-009.

- [x] **Region labels**: islands of the map named by dominant chemistry, computed in the browser from `atlas.json` (`map-regions.ts`). Grid-based connected components with hierarchical re-splitting of oversized islands (the HDBSCAN idea); names come from the dominant chemical family plus the most over-represented elements. 33 regions on MP v2026.09.28. Labels yield to anchor labels and appear as islands grow on screen.
- [x] **Density contours**: `d3.contourDensity` over the visible points (follows legend toggles) at 2%, 7% and 25% of peak density; recomputed on resize or visibility change, transformed on zoom. Toggleable.
  - _Not done_: a majority-category-per-pixel mode for dense regions (PixelatedScatter, TVCG 2025).
- [x] **Find similar** for anchors (option b): 60 nearest neighbors per anchor in the standardized UMAP feature space, computed in the pipeline (`nearest_neighbors` in `embed.py`), at most 3 per formula so polymorphs can't fill the list (quartz's uncapped 60 were all SiO2). If the cap drops a formula's entry with stiffness data, its nearest such entry is added back, so the UI never shows a false gap. The UI groups entries by formula. A side panel shows the top 20 formulas with elastic-data counts, sortable with elastic data first; neighbors are ringed on the map.
  - _Needs a data regeneration_ to appear on the site; older `atlas.json` files simply have no neighbors.
  - _Not done_: neighbors for arbitrary materials (option c: quantized feature matrix plus kNN in a Web Worker), and highlighting neighbors in the property profiles.

Considered and deferred: Mosaic/DuckDB-WASM linked views (built for millions to billions of rows; 154k fits in memory), a WebGPU renderer (the canvas draws in about 6 ms median and 30 ms p95), and natural-language queries (brushes already express those filters).

---

## Part 4: Technical Debt & Maintenance Backlog

| Item ID | Description                                                                 | Severity | Ceiling / Known Constraint                                                                   | Target Phase |
| :------ | :-------------------------------------------------------------------------- | :------- | :------------------------------------------------------------------------------------------- | :----------- |
| TD-01   | mp-api bulk-download path fails on Windows (URL-encodes the path separator) | Low      | `fetch.py` forces the paginated REST path via `num_chunks`; revisit when mp-api fixes it     | —            |
| TD-02   | `mendeleev` declares `<3.15`                                                | Low      | Installed with `--ignore-requires-python` on 3.15; drop the workaround when upstream updates | —            |
| TD-03   | Detail card shows raw unphysical moduli (e.g. -4.7e11 GPa)                  | Low      | Flag values outside physical bounds in the card, as the property profiles do                 | Phase 2      |
| TD-04   | Property-profile lines are sampled above 12,000 matches                     | Low      | Counts and map are exact; raise the cap or move lines to WebGL if sampling hides patterns    | Phase 3      |
