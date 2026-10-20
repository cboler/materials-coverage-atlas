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
- [ ] Regenerate `atlas.json` and review category counts and anchor assignments. Expected from a dry run on the cache: structural 10,494 (4,357 inferred), energy 16,871, electronic/optical 27,693, magnetic 14,833, unclassified 84,486.

### Phase 3: Orientation and discovery (documented, not yet scheduled)

Proposed after a review of recent visualization work. Not implemented; each needs a design pass before work starts.

- [ ] **Cluster labels**: name the UMAP islands so the map is readable without hovering.
  - _Pipeline_: density-based clustering on the 2D coordinates (e.g. HDBSCAN), then a label per cluster from its dominant chemistry: most common element set or anion class ("Li–TM oxides", "Ca silicates", "intermetallics"). Ship as `clusters: [{label, x, y, size}]` plus a per-material cluster id.
  - _UI_: labels at cluster centroids, collision-avoided like the anchor labels, shown or hidden by zoom level.
  - _Prior art_: Apple's Embedding Atlas (automatic clustering and labeling; arXiv 2505.06386).
- [ ] **Density contours**: show where materials concentrate and keep small groups from being buried by overdraw.
  - _UI_: `d3-contour` (already in the d3 bundle) over world coordinates, as an outline layer in the SVG overlay. Either one contour set for all points, or per category when a legend group is isolated. Recompute on resize, not on zoom (contours are transformed with the view).
  - _Option_: a majority-category-per-pixel mode for dense regions, after PixelatedScatter (TVCG 2025).
  - _Prior art_: Embedding Atlas (KDE density contours, order-independent transparency).
- [ ] **Find similar**: "the 25 materials closest to portlandite, ranked by whether they have elastic data", to support substitution and gap-filling around the construction anchors.
  - _Similarity must use the feature space, not 2D map distance_, because UMAP distorts distances between clusters.
  - _Options_: (a) precompute top-k neighbors in the pipeline (k=25 is about 3.9M ints, roughly 15–20 MB of JSON, too large to load by default); (b) precompute neighbors only for anchors and a curated list (small); (c) ship a compact quantized feature matrix and compute kNN in a Web Worker on demand. Start with (b) and revisit (c) if users want it for arbitrary materials.
  - _UI_: a "Similar materials" list in the detail card, highlighted on the map and in the property profiles.
  - _Prior art_: OptiMate (arXiv 2501.05903) uses UMAP maps to find substitute materials; Embedding Atlas offers nearest-neighbor search.

Considered and deferred: Mosaic/DuckDB-WASM linked views (built for millions to billions of rows; 154k fits in memory), a WebGPU renderer (the canvas draws in about 6 ms median and 30 ms p95), and natural-language queries (brushes already express those filters).

---

## Part 4: Technical Debt & Maintenance Backlog

| Item ID | Description                                                                 | Severity | Ceiling / Known Constraint                                                                   | Target Phase |
| :------ | :-------------------------------------------------------------------------- | :------- | :------------------------------------------------------------------------------------------- | :----------- |
| TD-01   | mp-api bulk-download path fails on Windows (URL-encodes the path separator) | Low      | `fetch.py` forces the paginated REST path via `num_chunks`; revisit when mp-api fixes it     | —            |
| TD-02   | `mendeleev` declares `<3.15`                                                | Low      | Installed with `--ignore-requires-python` on 3.15; drop the workaround when upstream updates | —            |
| TD-03   | Detail card shows raw unphysical moduli (e.g. -4.7e11 GPa)                  | Low      | Flag values outside physical bounds in the card, as the property profiles do                 | Phase 2      |
| TD-04   | Property-profile lines are sampled above 12,000 matches                     | Low      | Counts and map are exact; raise the cap or move lines to WebGL if sampling hides patterns    | Phase 3      |
