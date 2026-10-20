# Materials Coverage Atlas

An interactive d3.js atlas of the [Materials Project](https://materialsproject.org) database.
Every material is placed on a 2D map by UMAP over composition and property features, colored by
a rule-based candidate category, and can be re-colored by overlays that show where the database's
coverage is thin.

- **Categories**: structural, energy, electronic/optical, magnetic, unclassified. The rules are
  documented in [`pipeline/categories.py`](pipeline/categories.py) and shown in the app.
- **Overlays**: element abundance, element cost, experimental vs. theoretical, and elastic-data
  coverage (which entries lack bulk/shear moduli).
- **Anchors**: calcite, gypsum, portlandite, alite, belite, quartz, corundum, iron and aluminum
  are pinned and labeled as reference points.
- **Coverage table**: per category, the share of entries that are experimentally observed, have
  elastic data, or have cost data.

Built on [angular-pwa-starter](https://github.com/cboler/angular-pwa-starter): Angular 22, static
hosting on GitHub Pages, installable PWA.

---

## How it fits together

```
Materials Project API ──► pipeline/ (Python, run locally) ──► public/data/atlas.json ──► Angular + d3 app
                              │
                              └─ pipeline/cache/ (git-ignored local API cache)
```

The site is static. The Python pipeline runs on your machine, and its output
(`public/data/atlas.json`) is committed, so the deployed site never calls the API and never needs
your key.

### 1. Generate the data

Requires Python 3.11+ and a Materials Project API key in `MP_API_KEY`.

```bash
python -m venv .venv
.venv/Scripts/activate        # macOS/Linux: source .venv/bin/activate
pip install -r pipeline/requirements.txt
python pipeline/build_atlas.py
```

- The first run pulls summary data for every material (formula, elements, band gap, formation
  energy, energy above hull, theoretical flag, magnetic ordering, bulk/shear moduli, symmetry,
  density) and caches it in `pipeline/cache/summary.parquet`. Later runs read the cache and
  never call the API. Pass `--refresh` to re-pull.
- The UMAP embedding is cached too, keyed by the feature matrix and UMAP parameters, so changing
  category rules does not re-run UMAP.
- `--sample 20000` embeds a random subset (anchors are always kept) for fast iteration.
- Run the rule tests with `pytest pipeline`.
- On Python 3.15, `mendeleev` still declares `<3.15`. It is pure Python and works fine; install
  it with `pip install --ignore-requires-python "mendeleev>=0.17"` after installing the rest.

**Or build it in GitHub Actions.** Add your key as the `MP_API_KEY` repository secret, then run
**Actions → Build Atlas Data**. The workflow runs the pipeline, commits `public/data/atlas.json`,
and redeploys Pages. The API pull and embedding are kept in the Actions cache between runs.

### 2. Run the app

```bash
npm ci
npm start
```

Open `http://localhost:4200/`. Without `public/data/atlas.json` the page shows setup instructions.

---

## Using the atlas

- **Scroll or pinch** to zoom and **drag** to pan. **Reset view** restores the full map.
- **Hover** a point for a summary. **Click or tap** it to pin details, with a link to its
  Materials Project page.
- **Overlay buttons** recolor the map. **Legend entries** hide or show a group. With five
  categories on one scatter, no palette keeps every pair distinct under color-vision deficiency,
  so isolating groups from the legend is the reliable way to compare them.
- **Construction anchors** in the side panel select the pinned reference materials.

### Caveats

- Categories are screening heuristics on computed values, not property predictions. MP band
  gaps are GGA/GGA+U and typically underestimate experiment.
- Magnetic ordering comes from MP calculations that are initialized ferromagnetic, so many
  transition-metal compounds report FM even where experiment finds antiferromagnetism. The
  magnetic category is correspondingly generous (about a fifth of the database).
- Elastic moduli exist for only a small fraction of entries, so "structural" can only be assigned
  where that data exists. The elastic-coverage overlay shows the gap.
- Element cost is the mass-weighted raw element price. It ignores processing, so treat it as a
  floor. Abundance is the crustal abundance of the scarcest element in the formula. Both come
  from the `mendeleev` element table.

---

## Commands

| Command                          | Purpose                                                 |
| :------------------------------- | :------------------------------------------------------ |
| `python pipeline/build_atlas.py` | Build `public/data/atlas.json` (cached after first run) |
| `pytest pipeline`                | Category rule tests                                     |
| `npm start`                      | Angular dev server                                      |
| `npm test`                       | Vitest unit tests                                       |
| `npm run lint`                   | ESLint                                                  |
| `npm run format:check`           | Prettier check                                          |
| `npm run build:pages`            | Production build + GitHub Pages 404 fallback            |
| `npm run e2e`                    | Playwright smoke tests (phone, tablet, desktop)         |

## Deployment

Pushing to `main` builds and deploys to GitHub Pages via `.github/workflows/deploy.yml`. Set
**Settings → Pages → Source** to **GitHub Actions** once. The base href is resolved from the
repository name automatically.

## Data license

Materials Project data is licensed under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).
The app shows attribution and the database version on every page. Code is [MIT](LICENSE).

## Further docs

[AGENTS.md](AGENTS.md) · [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) ·
[docs/DECISIONS.md](docs/DECISIONS.md) · [docs/ROADMAP.md](docs/ROADMAP.md)
