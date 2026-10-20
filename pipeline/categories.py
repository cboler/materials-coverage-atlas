"""Rule-based candidate categories.

Every material is tested against each rule below independently, so one material can be a
candidate for several categories (e.g. iron is both magnetic and structural). For coloring,
each material also gets one *primary* category: the first matching category in ``PRIORITY``.
Materials that match nothing are "unclassified".

These are screening heuristics for a coverage map, not property predictions. Thresholds are
applied to Materials Project values as reported: band gaps are GGA/GGA+U and typically
underestimate experiment, and elastic moduli exist for only a small subset of entries.

Rules (all thresholds are module constants so they can be tuned in one place):

Gate (applies to every category)
    energy_above_hull <= MAX_E_HULL (0.1 eV/atom). Entries far above the convex hull are
    unlikely to be synthesizable, so they stay unclassified regardless of other properties.

structural
    Verified: has elastic data with MIN_SHEAR (25 GPa) <= G_VRH <= MAX_SHEAR (600 GPa) and
    0 < K_VRH <= MAX_BULK (500 GPa). Shear stiffness is the load-bearing criterion; the upper
    bounds discard unphysical fits (diamond, the stiffest known solid, is ~530 GPa shear).

    Inferred (only when there is *no* elastic data): a stable, wide-gap, oxygen-bearing
    compound made of earth-abundant elements, i.e. the oxides, silicates, carbonates,
    sulfates and hydroxides that make up cements, ceramics and aggregates. Specifically
    energy_above_hull <= INFERRED_MAX_E_HULL (0.05 eV/atom), band gap >= INFERRED_MIN_GAP
    (3 eV), contains O, and the scarcest element has crustal abundance >= INFERRED_MIN_PPM
    (10 ppm). Without this, ~7,500 stable wide-gap insulators (gypsum, belite, ...) had no
    category. Measured moduli always win: an entry with elastic data that fails the verified
    rule (e.g. soft portlandite) is not inferred structural. The ``structural_inferred`` flag
    records which basis applied so the UI can say so.

magnetic
    Ordering is ferromagnetic (FM) or ferrimagnetic (FiM) with net moment
    >= MIN_MAGNETIZATION (0.5 Bohr magnetons per formula unit), and the material is either
    metallic (band gap 0) or ferrimagnetic. MP calculations are initialized ferromagnetic and
    rarely search antiferromagnetic orderings, so 77% of compounds containing Fe/Co/Ni/Mn/Cr/V
    report FM. In insulators, magnetic ions usually couple antiparallel through superexchange
    (Goodenough-Kanamori), so an insulating "FM" result is most often an artifact; ferromagnetism
    is common in metals, and insulating ferrimagnets (ferrites, garnets) are genuine magnets.
    This drops ~17,800 insulating FM entries. The rare true FM insulators (CrBr3, EuO) are
    reported with ordering "Unknown" by MP and were never matched anyway. Antiferromagnets are
    excluded because they have no usable net moment.

energy
    Either a battery-electrode candidate, which needs all of:
      - a working ion (Li, Na, K, Mg, Zn) making up >= BATTERY_MIN_ION_FRACTION (5%) of the atoms;
      - a redox-active transition metal (Ti, V, Cr, Mn, Fe, Co, Ni, Cu, Nb, Mo, W);
      - an anion framework (O, F, S, P, Se, N), which separates electrode compounds from alloys;
      - no spectator cations (Rb, Cs, Ca, Sr, Ba), whose presence usually means a mineral;
      - energy_above_hull <= BATTERY_MAX_E_HULL (0.05 eV/atom).
    Band gap is deliberately not required: LiNiO2, LiTiS2, MgMn2O4 and MgCo2O4 are metallic in
    GGA. The earlier rule (any working ion + redox metal + gap > 0) matched 16,814 entries and
    missed those four; this one matches ~9,700 and keeps all 19 reference electrodes checked
    (LiCoO2, LiFePO4, LiMn2O4, NaFePO4, KMnO2, ZnMn2O4, Li4Ti5O12, ...).
    Or a photovoltaic-absorber candidate: PV_GAP_MIN (1.0 eV) <= band gap <= PV_GAP_MAX (1.8 eV),
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
INFERRED_MAX_E_HULL = 0.05  # eV/atom
INFERRED_MIN_GAP = 3.0  # eV
INFERRED_MIN_PPM = 10.0  # crustal abundance of the scarcest element, mg/kg
MIN_MAGNETIZATION = 0.5  # Bohr magnetons per formula unit
MAGNETIC_ORDERINGS = {"FM", "FiM"}
WORKING_IONS = {"Li", "Na", "K", "Mg", "Zn"}
REDOX_METALS = {"Ti", "V", "Cr", "Mn", "Fe", "Co", "Ni", "Cu", "Nb", "Mo", "W"}
FRAMEWORK_ANIONS = {"O", "F", "S", "P", "Se", "N"}
SPECTATOR_CATIONS = {"Rb", "Cs", "Ca", "Sr", "Ba"}
BATTERY_MIN_ION_FRACTION = 0.05
BATTERY_MAX_E_HULL = 0.05  # eV/atom
PV_GAP_MIN, PV_GAP_MAX = 1.0, 1.8  # eV
SEMI_GAP_MIN, SEMI_GAP_MAX = 0.1, 4.0  # eV

# Short rule text shipped with the atlas data so the UI documents exactly what was applied.
RULES = {
    "gate": f"Every category requires energy above hull ≤ {MAX_E_HULL} eV/atom.",
    "structural": (
        f"Verified: elastic data with {MIN_SHEAR:g} ≤ G_VRH ≤ {MAX_SHEAR:g} GPa and "
        f"0 < K_VRH ≤ {MAX_BULK:g} GPa. Inferred (no elastic data only): within "
        f"{INFERRED_MAX_E_HULL} eV/atom of the hull, band gap ≥ {INFERRED_MIN_GAP:g} eV, contains "
        f"O, and every element ≥ {INFERRED_MIN_PPM:g} ppm in Earth's crust."
    ),
    "magnetic": (
        f"FM or FiM ordering with net moment ≥ {MIN_MAGNETIZATION} μB per formula unit, and "
        "metallic or ferrimagnetic (insulating FM results are mostly artifacts of MP's "
        "ferromagnetic starting point)."
    ),
    "energy": (
        f"Battery electrode: Li/Na/K/Mg/Zn ≥ {BATTERY_MIN_ION_FRACTION:.0%} of atoms, a "
        "redox-active transition metal, an O/F/S/P/Se/N framework, no Rb/Cs/Ca/Sr/Ba, and within "
        f"{BATTERY_MAX_E_HULL} eV/atom of the hull (any band gap); or PV absorber: band gap "
        f"{PV_GAP_MIN}–{PV_GAP_MAX} eV."
    ),
    "electronic_optical": f"Band gap {SEMI_GAP_MIN}–{SEMI_GAP_MAX} eV (semiconductor to wide-gap).",
    "unclassified": "Matches no rule above (or fails the energy-above-hull gate).",
    "priority": "Primary category = first match in: magnetic, energy, structural, electronic/optical.",
}


def candidate_flags(df: pd.DataFrame) -> pd.DataFrame:
    """Boolean column per category (except unclassified): does the material pass that rule?

    Also returns ``structural_inferred`` (structural by composition, not elastic data). Needs a
    ``min_abundance`` column (crustal ppm of the scarcest element, NaN when unknown) and a
    ``working_ion_fraction`` column (atomic fraction of Li+Na+K+Mg+Zn in the formula).
    """
    gap = df["band_gap"]
    elements = df["elements"].map(set)
    gate = df["e_above_hull"] <= MAX_E_HULL  # NaN compares False, so missing hull data fails

    has_elastic = df["k_vrh"].notna() & df["g_vrh"].notna()
    structural_verified = (
        df["g_vrh"].between(MIN_SHEAR, MAX_SHEAR) & (df["k_vrh"] > 0) & (df["k_vrh"] <= MAX_BULK)
    )
    structural_inferred = (
        ~has_elastic
        & (df["e_above_hull"] <= INFERRED_MAX_E_HULL)
        & (gap >= INFERRED_MIN_GAP)
        & elements.map(lambda els: "O" in els)
        & (df["min_abundance"] >= INFERRED_MIN_PPM)
    )
    magnetic = (
        df["ordering"].isin(MAGNETIC_ORDERINGS)
        & (df["magnetization"] >= MIN_MAGNETIZATION)
        & ((gap <= 0) | (df["ordering"] == "FiM"))
    )
    battery = (
        (df["working_ion_fraction"] >= BATTERY_MIN_ION_FRACTION)
        & elements.map(
            lambda els: bool(els & REDOX_METALS)
            and bool(els & FRAMEWORK_ANIONS)
            and not els & SPECTATOR_CATIONS
        )
        & (df["e_above_hull"] <= BATTERY_MAX_E_HULL)
    )
    photovoltaic = gap.between(PV_GAP_MIN, PV_GAP_MAX)
    semiconductor = gap.between(SEMI_GAP_MIN, SEMI_GAP_MAX)

    return pd.DataFrame(
        {
            "structural": gate & (structural_verified | structural_inferred),
            "energy": gate & (battery | photovoltaic),
            "electronic_optical": gate & semiconductor,
            "magnetic": gate & magnetic,
            "structural_inferred": gate & structural_inferred,
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
