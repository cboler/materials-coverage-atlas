"""Composition + property features and the 2D UMAP embedding.

Feature blocks (each z-scored, then scaled so every block carries a comparable share of the
distance, regardless of how many columns it has):

    composition fractions   Atomic fraction of every element present in the dataset.
    element descriptors     Fraction-weighted mean and range (max - min) of Pauling
                            electronegativity, periodic row, group and Mendeleev number.
    properties              Band gap, formation energy, energy above hull (clipped to 0.5 eV),
                            log(1 + |magnetization|), density, log(volume per atom).

Elastic moduli and the theoretical flag are deliberately *not* features: they are overlays,
and leaving them out keeps the layout from sorting materials by what has been measured or
computed, so coverage gaps show up across the whole map instead of as their own island.

The embedding is cached in ``pipeline/cache/`` keyed by a hash of the feature matrix and the
UMAP parameters, so rebuilding the atlas after a rule change does not re-run UMAP.
"""

from __future__ import annotations

import hashlib
from functools import cache

import numpy as np
import pandas as pd
from pymatgen.core import Composition, Element

from fetch import CACHE_DIR

UMAP_PARAMS = {"n_neighbors": 30, "min_dist": 0.1, "metric": "euclidean", "random_state": 42}
BLOCK_WEIGHTS = {"composition": 1.0, "descriptors": 1.0, "properties": 1.0}
DESCRIPTOR_NAMES = ["X", "row", "group", "mendeleev_no"]


@cache
def _descriptors(symbol: str) -> tuple[float, ...]:
    element = Element(symbol)
    x = element.X if element.X == element.X else np.nan  # noble gases have no electronegativity
    return (x, element.row, element.group, element.mendeleev_no or np.nan)


def _composition_block(compositions: list[Composition]) -> tuple[np.ndarray, np.ndarray]:
    symbols = sorted({el.symbol for c in compositions for el in c.elements}, key=lambda s: Element(s).Z)
    column = {s: i for i, s in enumerate(symbols)}
    fractions = np.zeros((len(compositions), len(symbols)), dtype=np.float32)
    descriptors = np.zeros((len(compositions), 2 * len(DESCRIPTOR_NAMES)), dtype=np.float32)

    for row, comp in enumerate(compositions):
        frac = comp.fractional_composition
        weights = np.array([frac[el] for el in comp.elements])
        values = np.array([_descriptors(el.symbol) for el in comp.elements], dtype=float)
        for el, w in zip(comp.elements, weights):
            fractions[row, column[el.symbol]] = w
        mean = np.nansum(values * weights[:, None], axis=0)
        spread = (
            np.nanmax(values, axis=0) - np.nanmin(values, axis=0)
            if len(values) > 1
            else np.zeros(len(DESCRIPTOR_NAMES))
        )
        descriptors[row] = np.concatenate([mean, np.nan_to_num(spread)])
    return fractions, descriptors


def _property_block(df: pd.DataFrame) -> np.ndarray:
    props = pd.DataFrame(
        {
            "band_gap": df["band_gap"],
            "formation_energy": df["formation_energy"],
            "e_above_hull": df["e_above_hull"].clip(0, 0.5),
            "magnetization": np.log1p(df["magnetization"].abs()),
            "density": df["density"],
            "log_volume": np.log(df["volume_per_atom"]),
        }
    )
    # These fields are near-complete in MP; the median fill only covers a handful of entries.
    return props.fillna(props.median()).to_numpy(dtype=np.float32)


def _standardize(block: np.ndarray, weight: float) -> np.ndarray:
    std = block.std(axis=0)
    std[std == 0] = 1
    return (block - block.mean(axis=0)) / std * (weight / np.sqrt(block.shape[1]))


def feature_matrix(df: pd.DataFrame, compositions: list[Composition]) -> np.ndarray:
    fractions, descriptors = _composition_block(compositions)
    return np.hstack(
        [
            _standardize(fractions, BLOCK_WEIGHTS["composition"]),
            _standardize(descriptors, BLOCK_WEIGHTS["descriptors"]),
            _standardize(_property_block(df), BLOCK_WEIGHTS["properties"]),
        ]
    ).astype(np.float32)


def nearest_neighbors(features: np.ndarray, index: int, k: int) -> list[int]:
    """Indices of the k materials closest to `index` in feature space, nearest first.

    Uses the same standardized, block-weighted features as UMAP, but true Euclidean distance:
    UMAP preserves neighborhoods, not distances, so 2D map proximity can mislead between clusters.
    Brute force is fine for a handful of query materials (one pass over ~150k x ~100 floats each).
    """
    distances = np.linalg.norm(features - features[index], axis=1)
    distances[index] = np.inf
    k = min(k, len(features) - 1)
    nearest = np.argpartition(distances, k)[:k]
    return nearest[np.argsort(distances[nearest])].tolist()


def embed(features: np.ndarray) -> np.ndarray:
    """2D UMAP coordinates, cached by feature/parameter hash."""
    digest = hashlib.sha256(features.tobytes() + repr(sorted(UMAP_PARAMS.items())).encode())
    path = CACHE_DIR / f"embedding-{digest.hexdigest()[:16]}.npy"
    if path.exists():
        print(f"Using cached embedding {path.name}.")
        return np.load(path)

    import umap

    print(f"Running UMAP on {features.shape[0]} x {features.shape[1]} features (several minutes)...")
    coords = umap.UMAP(n_components=2, **UMAP_PARAMS).fit_transform(features)
    CACHE_DIR.mkdir(exist_ok=True)
    np.save(path, coords)
    return coords
