"""Pull Materials Project summary data once and cache it locally.

The cache lives in ``pipeline/cache/`` (git-ignored). ``load_summary()`` returns the cached
table unless the cache is missing, was built with a different field list, or ``refresh=True``.
That keeps iteration on categories/embedding/frontend from re-hitting the API.
"""

from __future__ import annotations

import json
import os
from datetime import datetime, timezone
from pathlib import Path

import pandas as pd

CACHE_DIR = Path(__file__).parent / "cache"
SUMMARY_PATH = CACHE_DIR / "summary.parquet"
SUMMARY_META_PATH = CACHE_DIR / "summary.meta.json"

# Summary-endpoint fields we request. Changing this list invalidates the cache.
FIELDS = [
    "material_id",
    "formula_pretty",
    "elements",
    "nelements",
    "nsites",
    "density",
    "volume",
    "band_gap",
    "is_metal",
    "formation_energy_per_atom",
    "energy_above_hull",
    "is_stable",
    "theoretical",
    "ordering",
    "total_magnetization_normalized_formula_units",
    "bulk_modulus",
    "shear_modulus",
    "symmetry",
]


def _vrh(value) -> float | None:
    """Elastic moduli come back as {"voigt", "reuss", "vrh"} dicts (older docs: a bare float)."""
    if value is None:
        return None
    if isinstance(value, dict):
        value = value.get("vrh")
    return None if value is None else float(value)


def _flatten(doc: dict) -> dict:
    symmetry = doc.get("symmetry") or {}
    nsites = doc.get("nsites") or 0
    volume = doc.get("volume")
    ordering = doc.get("ordering")
    return {
        "material_id": str(doc["material_id"]),
        "formula": doc.get("formula_pretty"),
        "elements": sorted(str(e) for e in (doc.get("elements") or [])),
        "nelements": doc.get("nelements"),
        "nsites": nsites,
        "density": doc.get("density"),
        "volume_per_atom": volume / nsites if volume and nsites else None,
        "band_gap": doc.get("band_gap"),
        "is_metal": doc.get("is_metal"),
        "formation_energy": doc.get("formation_energy_per_atom"),
        "e_above_hull": doc.get("energy_above_hull"),
        "is_stable": doc.get("is_stable"),
        "theoretical": doc.get("theoretical"),
        # Ordering is an enum (NM/FM/FiM/AFM/Unknown); store its plain string value.
        "ordering": getattr(ordering, "value", ordering),
        "magnetization": doc.get("total_magnetization_normalized_formula_units"),
        "k_vrh": _vrh(doc.get("bulk_modulus")),
        "g_vrh": _vrh(doc.get("shear_modulus")),
        "spacegroup_number": symmetry.get("number"),
        "spacegroup_symbol": symmetry.get("symbol"),
        "crystal_system": getattr(symmetry.get("crystal_system"), "value", symmetry.get("crystal_system")),
    }


def _fetch() -> tuple[pd.DataFrame, dict]:
    from mp_api.client import MPRester

    api_key = os.environ.get("MP_API_KEY")
    if not api_key:
        raise SystemExit("MP_API_KEY is not set; it is needed for the first (uncached) pull.")

    with MPRester(api_key, use_document_model=False) as mpr:
        version = mpr.db_version
        # Passing num_chunks makes mp-api page through the REST API with only FIELDS, instead of
        # downloading the full bulk dataset; that bulk path (mp-api 0.47) also fails on Windows
        # because it URL-encodes the path separator. 10k chunks x 1000 docs is far above MP's size.
        docs = mpr.materials.summary.search(fields=FIELDS, num_chunks=10_000, chunk_size=1000)

    df = pd.DataFrame([_flatten(d) for d in docs])
    meta = {
        "database_version": version,
        "fields": FIELDS,
        "fetched_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "count": len(df),
    }
    return df, meta


def load_summary(refresh: bool = False) -> tuple[pd.DataFrame, dict]:
    """Return (summary table, cache metadata), fetching from the API only when needed."""
    if not refresh and SUMMARY_PATH.exists() and SUMMARY_META_PATH.exists():
        meta = json.loads(SUMMARY_META_PATH.read_text())
        if meta.get("fields") == FIELDS:
            print(f"Using cached summary ({meta['count']} materials, MP {meta['database_version']}).")
            return pd.read_parquet(SUMMARY_PATH), meta
        print("Cached summary was built with a different field list; refetching.")

    print("Fetching summary data from the Materials Project API (this takes a few minutes)...")
    df, meta = _fetch()
    CACHE_DIR.mkdir(exist_ok=True)
    df.to_parquet(SUMMARY_PATH, index=False)
    SUMMARY_META_PATH.write_text(json.dumps(meta, indent=2))
    print(f"Cached {meta['count']} materials to {SUMMARY_PATH}.")
    return df, meta
