"""How far a stiffness prediction would have to extrapolate: a coverage indicator.

A gradient-boosting regressor is trained on the materials with physical elastic data to predict
bulk modulus (K_VRH) from the same features as the map, with a held-out test set for MAE. The
model exists only to make the indicator concrete; no predicted modulus is written to the atlas.

For every material without usable elastic data, the indicator is its mean Euclidean distance to
the K nearest materials that have elastic data, in the map's feature space. Distances in ~100
dimensions bunch together, so they are binned against the elastic set's own spacing (each
elastic material's mean distance to its K nearest other elastic materials): at or below its
median, up to its 90th and 99th percentiles, and beyond. "Beyond the 99th percentile" means
farther from any stiffness data than 99% of computed materials are from their neighbors.
Test-set error grouped by the same bins shows what they mean in GPa (few test rows land far out,
because a random split keeps the test set inside the training distribution).
"""

from __future__ import annotations

import numpy as np

KNN_K = 10
TEST_FRACTION = 0.2
BIN_PERCENTILES = [50, 90, 99]
BIN_LABELS = [
    "Close to stiffness data",
    "Moderately far",
    "Far",
    "Very far (beyond 99% of computed materials)",
]


def _mean_knn(reference: np.ndarray, queries: np.ndarray, k: int, skip_self: bool = False) -> np.ndarray:
    from sklearn.neighbors import NearestNeighbors

    k = min(k, len(reference) - int(skip_self))
    nn = NearestNeighbors(n_neighbors=k + int(skip_self), algorithm="brute").fit(reference)
    dist, _ = nn.kneighbors(queries)
    return dist[:, int(skip_self) :].mean(axis=1)


def spacing_edges(reference: np.ndarray, k: int = KNN_K) -> np.ndarray:
    """Bin edges: percentiles of the reference set's own leave-one-out k-NN distances."""
    return np.percentile(_mean_knn(reference, reference, k, skip_self=True), BIN_PERCENTILES)


def distance_bin(distances: np.ndarray, edges: np.ndarray) -> np.ndarray:
    """0..len(edges) by distance (a distance equal to an edge goes to the lower bin)."""
    return np.searchsorted(edges, distances, side="left")


def extrapolation(features: np.ndarray, k_vrh: np.ndarray, usable: np.ndarray, seed: int = 0) -> dict:
    """Train/test the K_VRH model and score every material's distance to the elastic data.

    ``usable`` marks materials with physical elastic data. Returns summary stats plus ``bins``:
    an int per material (-1 for materials with usable elastic data, else its distance bin).
    """
    from sklearn.ensemble import HistGradientBoostingRegressor
    from sklearn.model_selection import train_test_split

    pool = np.flatnonzero(usable)
    train_idx, test_idx = train_test_split(pool, test_size=TEST_FRACTION, random_state=seed)
    model = HistGradientBoostingRegressor(random_state=seed).fit(features[train_idx], k_vrh[train_idx])
    errors = np.abs(model.predict(features[test_idx]) - k_vrh[test_idx])

    train = features[train_idx]
    test_bins = distance_bin(_mean_knn(train, features[test_idx], KNN_K), spacing_edges(train))
    by_distance = [
        {
            "bin": label,
            "n": int((test_bins == b).sum()),
            "mae_gpa": round(float(errors[test_bins == b].mean()), 1) if (test_bins == b).any() else None,
        }
        for b, label in enumerate(BIN_LABELS)
    ]

    # The overlay measures distance to the whole pool: the data any such model would learn from.
    reference = features[pool]
    edges = spacing_edges(reference)
    missing = np.flatnonzero(~usable)
    bins = np.full(len(features), -1, dtype=int)
    bins[missing] = distance_bin(_mean_knn(reference, features[missing], KNN_K), edges)

    return {
        "model": "scikit-learn HistGradientBoostingRegressor (default settings), target K_VRH",
        "features": "same standardized composition + property features as the map",
        "n_train": int(len(train_idx)),
        "n_test": int(len(test_idx)),
        "mae_gpa": round(float(errors.mean()), 1),
        "baseline_mae_gpa": round(float(np.abs(k_vrh[test_idx] - np.median(k_vrh[train_idx])).mean()), 1),
        "k": KNN_K,
        "bin_percentiles": BIN_PERCENTILES,
        "bin_labels": BIN_LABELS,
        "mae_by_distance": by_distance,
        "counts": [int((bins == b).sum()) for b in range(len(BIN_LABELS))],
        "bins": bins,
    }
