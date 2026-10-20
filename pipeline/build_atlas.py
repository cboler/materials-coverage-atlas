"""Build ``public/data/atlas.json`` for the web app.

    python pipeline/build_atlas.py              # uses the local cache after the first run
    python pipeline/build_atlas.py --refresh    # re-pull from the Materials Project API
    python pipeline/build_atlas.py --sample 20000   # quick iteration on a random subset
    python pipeline/build_atlas.py --out /tmp/atlas.json   # trial build without touching public/

The output is columnar (one array per field) to keep ~150k materials small enough to load
in a browser; coordinates are quantized to integers 0..COORD_SCALE.
"""

from __future__ import annotations

import argparse
import json
import math
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import pandas as pd
from pymatgen.core import Composition

from categories import CATEGORIES, RULES, WORKING_IONS, assign_categories
from embed import BLOCK_WEIGHTS, UMAP_PARAMS, embed, feature_matrix, nearest_neighbors
from fetch import load_summary
from supply import supply_metrics

OUT_PATH = Path(__file__).resolve().parent.parent / "public" / "data" / "atlas.json"
COORD_SCALE = 10000
# Neighbors stored per anchor, at most SIMILAR_PER_FORMULA per formula so polymorphs can't crowd
# out other compounds (quartz's 60 nearest were all SiO2). 60 / 3 guarantees the UI's 20 formulas.
SIMILAR_K = 60
SIMILAR_PER_FORMULA = 3
ORDERINGS = ["NM", "FM", "FiM", "AFM", "Unknown"]

# Construction-material anchors. Each is resolved to an MP entry by reduced formula, preferring
# (1) one of the listed space groups, (2) experimentally observed entries, (3) lowest energy
# above hull. Set "material_id" to pin a specific entry instead.
ANCHORS = [
    {"name": "Calcite", "formula": "CaCO3", "spacegroups": [167]},  # R-3c
    {"name": "Gypsum", "formula": "CaSO4(H2O)2", "spacegroups": [15]},  # C2/c (a.k.a. I2/a)
    {"name": "Portlandite", "formula": "Ca(OH)2", "spacegroups": [164]},  # P-3m1
    {"name": "Alite", "formula": "Ca3SiO5", "spacegroups": []},  # many polymorphs; any accepted
    {"name": "Belite", "formula": "Ca2SiO4", "spacegroups": [14]},  # beta-C2S, P2_1/c
    {"name": "Quartz", "formula": "SiO2", "spacegroups": [152, 154]},  # alpha, P3_121 / P3_221
    {"name": "Corundum", "formula": "Al2O3", "spacegroups": [167]},  # R-3c
    {"name": "Iron", "formula": "Fe", "spacegroups": [229]},  # alpha (bcc), Im-3m
    {"name": "Aluminum", "formula": "Al", "spacegroups": [225]},  # fcc, Fm-3m
]


def resolve_anchors(df: pd.DataFrame) -> list[dict]:
    resolved = []
    for anchor in ANCHORS:
        if "material_id" in anchor:
            matches = df[df["material_id"] == anchor["material_id"]]
        else:
            # MP's formula_pretty is pymatgen's reduced formula, so normalize the anchor the same way.
            target = Composition(anchor["formula"])
            symbols = sorted(el.symbol for el in target.elements)
            matches = df[df["elements"].map(lambda els: list(els) == symbols)]
            matches = matches[
                matches["formula"].map(lambda f: Composition(f).reduced_formula == target.reduced_formula)
            ]
        if matches.empty:
            print(f"  ! anchor {anchor['name']} ({anchor['formula']}): no MP entry found, skipped")
            continue
        sg_miss = ~matches["spacegroup_number"].isin(anchor["spacegroups"]) if anchor["spacegroups"] else False
        ranked = matches.assign(
            sg_miss=sg_miss,
            theoretical_rank=matches["theoretical"].fillna(True).astype(bool),
        ).sort_values(["sg_miss", "theoretical_rank", "e_above_hull"])
        best = ranked.iloc[0]
        if anchor["spacegroups"] and best["sg_miss"]:
            print(f"  ! anchor {anchor['name']}: no entry in space groups {anchor['spacegroups']}")
        print(f"  anchor {anchor['name']}: {best['material_id']} {best['formula']} {best['spacegroup_symbol']}")
        resolved.append({"name": anchor["name"], "material_id": best["material_id"]})
    return resolved


def _round(values, digits: int) -> list:
    return [None if v is None or (isinstance(v, float) and math.isnan(v)) else round(float(v), digits) for v in values]


def _sig(values, figures: int = 3) -> list:
    """Round to significant figures (prices and abundances span ~10 orders of magnitude)."""
    out = []
    for v in values:
        if v is None or (isinstance(v, float) and math.isnan(v)) or v <= 0:
            out.append(None)
        else:
            out.append(float(f"{v:.{figures}g}"))
    return out


def build(refresh: bool, sample: int | None, out_path: Path) -> None:
    df, cache_meta = load_summary(refresh)
    df = df.dropna(subset=["formula"]).reset_index(drop=True)

    print("Resolving construction-material anchors...")
    anchors = resolve_anchors(df)

    if sample and sample < len(df):
        keep = df.sample(sample, random_state=0).index.union(
            df.index[df["material_id"].isin([a["material_id"] for a in anchors])]
        )
        df = df.loc[keep].reset_index(drop=True)
        print(f"Sampled {len(df)} materials (anchors always included).")

    print("Parsing compositions...")
    compositions = [Composition(f) for f in df["formula"]]

    # Supply metrics come first: the inferred-structural rule needs the scarcest element's abundance.
    print("Computing supply metrics...")
    cost, abundance, scarcest = zip(*(supply_metrics(c) for c in compositions))
    df["min_abundance"] = pd.to_numeric(pd.Series(abundance, index=df.index), errors="coerce")
    df["working_ion_fraction"] = [
        sum(c.get_atomic_fraction(el) for el in c.elements if el.symbol in WORKING_IONS)
        for c in compositions
    ]

    print("Applying category rules...")
    primary, flags = assign_categories(df)
    for category in CATEGORIES:
        print(f"  {category}: {(primary == category).sum()} primary")
    inferred = flags["structural_inferred"] & (primary == "structural")
    print(f"  (structural by composition, no elastic data: {inferred.sum()})")

    print("Building features...")
    features = feature_matrix(df, compositions)
    formulas = df["formula"].to_numpy()
    has_elastic = df["k_vrh"].notna().to_numpy()
    coords = embed(features)
    lo, hi = coords.min(axis=0), coords.max(axis=0)
    quantized = np.rint((coords - lo) / (hi - lo).max() * COORD_SCALE).astype(int)

    # Bit i set = candidate for CATEGORIES[i] (multi-label; "category" holds the primary one).
    label_bits = sum(flags[c].astype(int) * (1 << i) for i, c in enumerate(CATEGORIES[:-1]))
    index_of = {mid: i for i, mid in enumerate(df["material_id"])}

    atlas = {
        "meta": {
            "source": "Materials Project (materialsproject.org), CC BY 4.0",
            "database_version": cache_meta["database_version"],
            "fetched_at": cache_meta["fetched_at"],
            "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
            "count": len(df),
            "sampled": bool(sample),
            "coord_scale": COORD_SCALE,
            "categories": CATEGORIES,
            "orderings": ORDERINGS,
            "rules": RULES,
            "umap": {**UMAP_PARAMS, "block_weights": BLOCK_WEIGHTS},
        },
        "columns": {
            "id": df["material_id"].tolist(),
            "formula": df["formula"].tolist(),
            "x": quantized[:, 0].tolist(),
            "y": quantized[:, 1].tolist(),
            "category": primary.map(CATEGORIES.index).tolist(),
            "labels": label_bits.tolist(),
            # 1 = structural candidacy rests on composition (no elastic data), not measured moduli.
            "structural_inferred": flags["structural_inferred"].astype(int).tolist(),
            "theoretical": df["theoretical"].fillna(True).astype(int).tolist(),
            "band_gap": _round(df["band_gap"], 2),
            "formation_energy": _round(df["formation_energy"], 3),
            "e_above_hull": _round(df["e_above_hull"], 3),
            "k_vrh": _round(df["k_vrh"], 0),
            "g_vrh": _round(df["g_vrh"], 0),
            "ordering": df["ordering"].map(lambda o: ORDERINGS.index(o) if o in ORDERINGS else ORDERINGS.index("Unknown")).tolist(),
            "cost": _sig(cost),
            "abundance": _sig(abundance),
            "scarcest": list(scarcest),
        },
        "anchors": [
            {
                **a,
                "index": index_of[a["material_id"]],
                "similar": nearest_neighbors(
                    features,
                    index_of[a["material_id"]],
                    SIMILAR_K,
                    labels=formulas,
                    per_label=SIMILAR_PER_FORMULA,
                    prefer=has_elastic,
                ),
            }
            for a in anchors
            if a["material_id"] in index_of
        ],
    }

    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(atlas, separators=(",", ":"), ensure_ascii=False), encoding="utf-8")
    print(f"Wrote {out_path} ({out_path.stat().st_size / 1e6:.1f} MB, {len(df)} materials).")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--refresh", action="store_true", help="ignore the cache and re-pull from the API")
    parser.add_argument("--sample", type=int, help="embed a random subset of N materials")
    parser.add_argument("--out", type=Path, default=OUT_PATH, help="output path (default: public/data/atlas.json)")
    args = parser.parse_args()
    build(args.refresh, args.sample, args.out)
