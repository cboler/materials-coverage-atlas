"""Entry age and where newer entries land: filling gaps or crowding existing clusters?

What Materials Project exposes per entry (checked on v2026.09.28):

- ``theoretical`` (summary) and ``database_IDs`` (ICSD, Pauling) mark experimental matches.
- The provenance collection has ``created_at``, authors, remarks, tags and a structure
  ``history``. ``created_at`` is coarse: about 87% of entries carry one of three bulk-rebuild
  dates (2016-04-20, 2017-07-18, 2024-11-22), so iron (mp-13, in MP since 2011) shows 2017.
- ``builder_meta`` names the calculation batch of the current data, not when the material
  entered the database.
- No public field marks ML-pipeline origin. GNoME-derived entries are the access-controlled
  ``gnome_r2scan_statics`` batch (listed by the API heartbeat); they are absent from the public
  summary and from this atlas.

Fallback: entry order. Material IDs were assigned sequentially as entries were added, and the
current IDs (``mp-aaaaaaan``) are the old numbers written in base 26 with a = 0 (mp-13). Among
entries whose ``created_at`` is not a rebuild date, the median old number rises every year
(~27k in 2011, ~1.0M in 2016, ~1.25M in 2019, ~2.7M in 2022), so it orders entries by when
they were added. Tier edges are calibrated that way and recomputed in the build output.

Where newer entries land: for each newer entry, the mean Euclidean distance to its K nearest
*older* entries in the UMAP feature space; for a random sample of older entries, the same
distance to other older entries. If newer entries followed the existing distribution, 25% of
them would sit beyond the older entries' 75th percentile.
"""

from __future__ import annotations

import numpy as np
import pandas as pd

# Old-number tier edges: < 1.0M added before ~2017, 1.0M-1.5M ~2017-2020, >= 1.5M ~2020 on.
TIER_EDGES = [1_000_000, 1_500_000]
TIER_LABELS = ["before ~2017", "~2017–2020", "~2020 onward"]
NEWER_TIER = 2
KNN_K = 10
BASELINE_SAMPLE = 20_000
SPARSE_PERCENTILE = 75
# A created_at day holding at least this share of all entries is a bulk-rebuild stamp, not an
# addition date (three days hold ~87% of entries; real batch imports are far smaller).
REBUILD_SHARE_MIN = 0.05


def legacy_number(material_id: str) -> int | None:
    """Old numeric MP ID: "mp-aaaaaaan" (base 26, a = 0) -> 13; "mp-13" -> 13."""
    prefix, _, body = material_id.partition("-")
    if not body:
        return None
    if body.isdigit():
        return int(body)
    if not body.isalpha() or not body.islower():
        return None
    n = 0
    for ch in body:
        n = n * 26 + ord(ch) - ord("a")
    return n


def entry_tier(numbers: pd.Series) -> pd.Series:
    """0, 1 or 2 by old-number tier (NaN numbers go to the oldest tier)."""
    return pd.Series(np.searchsorted(TIER_EDGES, numbers.fillna(0), side="right"), index=numbers.index)


def tier_calibration(numbers: pd.Series, created_at: pd.Series) -> dict:
    """Median creation year per tier, ignoring bulk-rebuild dates; and the rebuild share."""
    day = created_at.dt.date
    counts = day.value_counts()
    stamps = counts[counts >= REBUILD_SHARE_MIN * created_at.notna().sum()].index
    rebuild = day.isin(stamps)
    tiers = entry_tier(numbers)
    usable = created_at.notna() & ~rebuild
    medians = created_at[usable].dt.year.groupby(tiers[usable]).median()
    return {
        "rebuild_dates": sorted(str(d) for d in stamps),
        "rebuild_share": round(float(rebuild[created_at.notna()].mean()), 3),
        "median_created_year_by_tier": {
            TIER_LABELS[t]: int(medians[t]) for t in range(len(TIER_LABELS)) if t in medians
        },
    }


def _mean_knn(reference: np.ndarray, queries: np.ndarray, k: int, skip_self: bool) -> np.ndarray:
    from sklearn.neighbors import NearestNeighbors

    nn = NearestNeighbors(n_neighbors=k + int(skip_self), algorithm="brute").fit(reference)
    dist, _ = nn.kneighbors(queries)
    return dist[:, int(skip_self) :].mean(axis=1)


def novelty(features: np.ndarray, newer: np.ndarray, k: int = KNN_K, seed: int = 0) -> dict:
    """k-NN distance of newer entries to older ones vs older entries among themselves.

    Returns the summary stats and a per-material ``sparse`` mask (newer entries beyond the older
    entries' SPARSE_PERCENTILE).
    """
    older_idx = np.flatnonzero(~newer)
    newer_idx = np.flatnonzero(newer)
    reference = features[older_idx]
    rng = np.random.default_rng(seed)
    sample = rng.choice(len(older_idx), size=min(BASELINE_SAMPLE, len(older_idx)), replace=False)
    baseline = _mean_knn(reference, reference[sample], k, skip_self=True)
    to_older = _mean_knn(reference, features[newer_idx], k, skip_self=False)

    cut = float(np.percentile(baseline, SPARSE_PERCENTILE))
    sparse = np.zeros(len(features), dtype=bool)
    sparse[newer_idx] = to_older > cut
    return {
        "k": k,
        "newer": int(len(newer_idx)),
        "older": int(len(older_idx)),
        "baseline_sample": int(len(sample)),
        "median_newer_to_older": round(float(np.median(to_older)), 3),
        "median_older_to_older": round(float(np.median(baseline)), 3),
        "sparse_cut": round(cut, 3),
        "share_newer_sparse": round(float((to_older > cut).mean()), 3),
        "share_expected": round(1 - SPARSE_PERCENTILE / 100, 3),
        "sparse": sparse,
    }
