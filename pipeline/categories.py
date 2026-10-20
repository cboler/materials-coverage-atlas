"""Rule-based candidate categories.

Every material is tested against each rule below independently, so one material can be a
candidate for several categories (e.g. iron is both magnetic and structural). For coloring,
each material also gets one *primary* category: the first matching category in ``PRIORITY``.
Materials that match nothing are "unclassified".

These are screening heuristics for a coverage map, not property predictions. Thresholds are
applied to Materials Project values as reported: band gaps are GGA/GGA+U and typically
underestimate experiment, and elastic moduli exist for only a small subset of entries, so
"structural" can only ever be assigned where elastic data exists.

Rules (all thresholds are module constants so they can be tuned in one place):

Gate (applies to every category)
    energy_above_hull <= MAX_E_HULL (0.1 eV/atom). Entries far above the convex hull are
    unlikely to be synthesizable, so they stay unclassified regardless of other properties.

structural
    Has elastic data with MIN_SHEAR (25 GPa) <= G_VRH <= MAX_SHEAR (600 GPa) and
    0 < K_VRH <= MAX_BULK (500 GPa). Shear stiffness is the load-bearing criterion; the upper
    bounds discard unphysical fits (diamond, the stiffest known solid, is ~530 GPa shear).

magnetic
    Ordering is ferromagnetic (FM) or ferrimagnetic (FiM) with net moment
    >= MIN_MAGNETIZATION (0.5 Bohr magnetons per formula unit). Antiferromagnets are excluded
    because they have no usable net moment. MP calculations are initialized ferromagnetic, so
    many transition-metal compounds report FM even where experiment finds AFM; this category
    is therefore generous.

energy
    Either a battery-electrode candidate: contains a working ion (Li, Na, K, Mg, Zn) and a
    redox-active transition metal (Ti, V, Cr, Mn, Fe, Co, Ni, Cu, Nb, Mo, W) and is not metallic
    (band gap > 0);
    or a photovoltaic-absorber candidate: PV_GAP_MIN (1.0 eV) <= band gap <= PV_GAP_MAX (1.8 eV),
    the window around the Shockley-Queisser optimum.

electronic/optical
    Semiconductor to wide-gap insulator: SEMI_GAP_MIN (0.1 eV) <= band gap <= SEMI_GAP_MAX
    (4.0 eV), which spans infrared detectors through UV-transparent conductors and LEDs.

Primary category priority: magnetic, energy, structural, electronic/optical. The narrowest,
most chemistry-specific rules win; electronic/optical is the broadest window, so it goes last.
"""

from __future__ import annotations

import pandas as pd

CATEGORIES = ["structural", "energy", "electronic_optical", "magnetic", "unclassified"]
PRIORITY = ["magnetic", "energy", "structural", "electronic_optical"]

MAX_E_HULL = 0.1  # eV/atom
MIN_SHEAR, MAX_SHEAR, MAX_BULK = 25.0, 600.0, 500.0  # GPa
MIN_MAGNETIZATION = 0.5  # Bohr magnetons per formula unit
MAGNETIC_ORDERINGS = {"FM", "FiM"}
WORKING_IONS = {"Li", "Na", "K", "Mg", "Zn"}
REDOX_METALS = {"Ti", "V", "Cr", "Mn", "Fe", "Co", "Ni", "Cu", "Nb", "Mo", "W"}
PV_GAP_MIN, PV_GAP_MAX = 1.0, 1.8  # eV
SEMI_GAP_MIN, SEMI_GAP_MAX = 0.1, 4.0  # eV

# Short rule text shipped with the atlas data so the UI documents exactly what was applied.
RULES = {
    "gate": f"Every category requires energy above hull ≤ {MAX_E_HULL} eV/atom.",
    "structural": (
        f"Elastic data present with {MIN_SHEAR:g} ≤ G_VRH ≤ {MAX_SHEAR:g} GPa "
        f"and 0 < K_VRH ≤ {MAX_BULK:g} GPa."
    ),
    "magnetic": f"FM or FiM ordering with net moment ≥ {MIN_MAGNETIZATION} μB per formula unit.",
    "energy": (
        "Battery electrode: contains Li/Na/K/Mg/Zn plus a redox-active transition metal and has a "
        f"band gap > 0; or PV absorber: band gap {PV_GAP_MIN}–{PV_GAP_MAX} eV."
    ),
    "electronic_optical": f"Band gap {SEMI_GAP_MIN}–{SEMI_GAP_MAX} eV (semiconductor to wide-gap).",
    "unclassified": "Matches no rule above (or fails the energy-above-hull gate).",
    "priority": "Primary category = first match in: magnetic, energy, structural, electronic/optical.",
}


def candidate_flags(df: pd.DataFrame) -> pd.DataFrame:
    """Boolean column per category (except unclassified): does the material pass that rule?"""
    gap = df["band_gap"]
    elements = df["elements"].map(set)
    gate = df["e_above_hull"] <= MAX_E_HULL  # NaN compares False, so missing hull data fails

    structural = (
        df["g_vrh"].between(MIN_SHEAR, MAX_SHEAR) & (df["k_vrh"] > 0) & (df["k_vrh"] <= MAX_BULK)
    )
    magnetic = df["ordering"].isin(MAGNETIC_ORDERINGS) & (df["magnetization"] >= MIN_MAGNETIZATION)
    battery = (
        elements.map(lambda els: bool(els & WORKING_IONS) and bool(els & REDOX_METALS)) & (gap > 0)
    )
    photovoltaic = gap.between(PV_GAP_MIN, PV_GAP_MAX)
    semiconductor = gap.between(SEMI_GAP_MIN, SEMI_GAP_MAX)

    return pd.DataFrame(
        {
            "structural": gate & structural,
            "energy": gate & (battery | photovoltaic),
            "electronic_optical": gate & semiconductor,
            "magnetic": gate & magnetic,
        },
        index=df.index,
    )


def assign_categories(df: pd.DataFrame) -> tuple[pd.Series, pd.DataFrame]:
    """Return (primary category per material, candidate flags per category)."""
    flags = candidate_flags(df)
    primary = pd.Series("unclassified", index=df.index)
    # Walk priority lowest-first so higher-priority matches overwrite.
    for category in reversed(PRIORITY):
        primary[flags[category]] = category
    return primary, flags
