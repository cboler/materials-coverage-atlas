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
    Verified: usable elastic data with G_VRH >= MIN_SHEAR (25 GPa). Elastic data is "usable"
    (physical) when 0 < K_VRH <= MAX_BULK (500 GPa) and 0 < G_VRH <= MAX_SHEAR (600 GPa); the
    upper bounds discard broken fits (diamond, the stiffest known solid, is ~530 GPa shear).
    Shear stiffness is the load-bearing criterion.

    Inferred (only when there is *no usable* elastic data): the material passes the
    structural-candidate rule below. Measured moduli win when they are physical: an entry whose
    moduli are physical but soft (e.g. portlandite) is not inferred structural. An entry whose
    fit is unphysical (aluminum, mp-134, reports G_VRH = -14 GPa) is treated as having no
    stiffness data and falls back to the candidate rule. The ``structural_inferred`` flag
    records which basis applied so the UI can say so.

structural candidate (never uses moduli)
    A screening population defined from composition and stability alone, so elastic coverage
    can be measured on it without circularity. (Elastic coverage of the "structural" category
    itself is partly built in: the verified path admits only entries that have elastic data.)
    Within STRUCTURAL_MAX_E_HULL (0.05 eV/atom) of the hull, every element at least
    CANDIDATE_MIN_PPM (10 ppm) in Earth's crust, and one of:
      - mineral/ceramic: band gap >= CANDIDATE_MIN_GAP (3 eV) and contains O: the oxides,
        silicates, carbonates, sulfates and hydroxides of cements, ceramics and aggregates;
      - metallic/alloy: metallic (band gap 0), made only of STRUCTURAL_METALS plus the
        alloying light elements in ALLOY_LIGHT_ELEMENTS, with at least one BASE_METALS element
        (Fe, Al, Ti, Mg, Cu, Ni): steels, aluminum, titanium and magnesium alloys, bronzes. The
        10 ppm floor removes Mo, W and Sn alloys from this composition-only path.

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
STRUCTURAL_MAX_E_HULL = 0.05  # eV/atom
CANDIDATE_MIN_GAP = 3.0  # eV
CANDIDATE_MIN_PPM = 10.0  # crustal abundance of the scarcest element, mg/kg
STRUCTURAL_METALS = {"Fe", "Al", "Ti", "Mg", "Cu", "Ni", "Cr", "Mn", "Zn", "Co", "V", "Zr", "Nb", "Mo", "W", "Sn"}
BASE_METALS = {"Fe", "Al", "Ti", "Mg", "Cu", "Ni"}
ALLOY_LIGHT_ELEMENTS = {"C", "Si", "B", "N"}
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
        f"Verified: physical elastic data (0 < K_VRH ≤ {MAX_BULK:g}, 0 < G_VRH ≤ {MAX_SHEAR:g} GPa) "
        f"with G_VRH ≥ {MIN_SHEAR:g} GPa. Inferred (no usable elastic data: none computed, or an "
        "unphysical fit): passes the structural-candidate rule."
    ),
    "structural_candidate": (
        f"Never uses moduli. Within {STRUCTURAL_MAX_E_HULL} eV/atom of the hull, every element ≥ "
        f"{CANDIDATE_MIN_PPM:g} ppm in Earth's crust, and either mineral/ceramic (band gap ≥ "
        f"{CANDIDATE_MIN_GAP:g} eV, contains O) or metallic/alloy (band gap 0, only "
        f"{'/'.join(sorted(STRUCTURAL_METALS))} plus {'/'.join(sorted(ALLOY_LIGHT_ELEMENTS))}, "
        f"with at least one of {'/'.join(sorted(BASE_METALS))})."
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


def structural_candidate(df: pd.DataFrame) -> pd.Series:
    """Moduli-blind structural candidacy (composition and stability only); see module docstring."""
    elements = df["elements"].map(set)
    common = (df["e_above_hull"] <= STRUCTURAL_MAX_E_HULL) & (df["min_abundance"] >= CANDIDATE_MIN_PPM)
    ceramic = (df["band_gap"] >= CANDIDATE_MIN_GAP) & elements.map(lambda els: "O" in els)
    metallic = (df["band_gap"] <= 0) & elements.map(
        lambda els: els <= STRUCTURAL_METALS | ALLOY_LIGHT_ELEMENTS and bool(els & BASE_METALS)
    )
    return common & (ceramic | metallic)


def physical_elastic(df: pd.DataFrame) -> pd.Series:
    """Elastic data present and within physical bounds (broken fits count as no data)."""
    return (
        (df["k_vrh"] > 0) & (df["k_vrh"] <= MAX_BULK) & (df["g_vrh"] > 0) & (df["g_vrh"] <= MAX_SHEAR)
    )


def candidate_flags(df: pd.DataFrame) -> pd.DataFrame:
    """Boolean column per category (except unclassified): does the material pass that rule?

    Also returns ``structural_inferred`` (structural by the candidate rule, without usable elastic
    data) and ``structural_candidate`` (the moduli-blind population). Needs a ``min_abundance``
    column (crustal ppm of the scarcest element, NaN when unknown) and a
    ``working_ion_fraction`` column (atomic fraction of Li+Na+K+Mg+Zn in the formula).
    """
    gap = df["band_gap"]
    elements = df["elements"].map(set)
    gate = df["e_above_hull"] <= MAX_E_HULL  # NaN compares False, so missing hull data fails

    usable_elastic = physical_elastic(df)
    candidate = structural_candidate(df)
    structural_verified = usable_elastic & (df["g_vrh"] >= MIN_SHEAR)
    structural_inferred = ~usable_elastic & candidate
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
            "structural_candidate": gate & candidate,
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
