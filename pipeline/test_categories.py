import math

import pandas as pd

from categories import NONMETALS, assign_categories

NAN = math.nan


def material(**overrides):
    base = {
        "elements": ["O", "Si"],
        "band_gap": 0.0,
        "e_above_hull": 0.0,
        "k_vrh": NAN,
        "g_vrh": NAN,
        "ordering": "NM",
        "magnetization": 0.0,
        "min_abundance": 1000.0,
        "cost": 1.0,
        "working_ion_fraction": 0.0,
    }
    row = {**base, **overrides}
    # Equal-share approximation of the atomic nonmetal fraction unless a test sets it.
    row.setdefault(
        "nonmetal_fraction", sum(e in NONMETALS for e in row["elements"]) / len(row["elements"])
    )
    return row


def classify(*rows):
    primary, flags = assign_categories(pd.DataFrame(rows))
    return primary.tolist(), flags


def test_each_rule_in_isolation():
    primary, _ = classify(
        material(k_vrh=200, g_vrh=150),  # stiff, no gap
        material(elements=["Co"], ordering="FM", magnetization=1.6),  # not a base structural metal
        material(elements=["Co", "Li", "O"], band_gap=2.5, working_ion_fraction=0.25),  # cathode
        material(band_gap=1.4),  # PV window
        material(band_gap=2.5),  # semiconductor window
        material(),  # metal, no data
    )
    assert primary == [
        "structural_ceramic",
        "magnetic",
        "energy",
        "energy",
        "electronic_optical",
        "unclassified",
    ]


def test_hull_gate_blocks_everything():
    primary, flags = classify(material(e_above_hull=0.2, k_vrh=200, g_vrh=150, band_gap=1.4))
    assert primary == ["unclassified"]
    assert not flags.iloc[0].any()


def test_priority_and_multi_label():
    # Iron: a stiff ferromagnetic metal is colored structural, and magnetic stays flagged.
    primary, flags = classify(
        material(elements=["Fe"], ordering="FM", magnetization=2.2, k_vrh=170, g_vrh=80)
    )
    assert primary == ["structural_metallic"]
    assert flags.iloc[0]["magnetic"]


def test_ceramics_rank_below_magnetic_and_energy():
    primary, flags = classify(
        # Insulating ferrimagnetic oxide (a ferrite): stays magnetic.
        material(elements=["Fe", "O"], ordering="FiM", magnetization=4.0, band_gap=3.5),
        # Wide-gap Li cathode (LiFePO4-like): stays energy, though it is an inferred ceramic.
        material(elements=["Fe", "Li", "O", "P"], band_gap=3.7, working_ion_fraction=0.14),
    )
    assert primary == ["magnetic", "energy"]
    assert flags["structural_ceramic"].tolist() == [True, True]


def test_rejects_weak_or_unphysical_elastic_data_and_antiferromagnets():
    primary, _ = classify(
        material(k_vrh=40, g_vrh=10),
        material(k_vrh=-5, g_vrh=60),
        material(k_vrh=200, g_vrh=900),
        material(elements=["Mn", "O"], ordering="AFM", magnetization=0.0),
        material(elements=["Li", "Co", "O"], working_ion_fraction=0.02),  # Li only a trace
    )
    assert primary == ["unclassified"] * 5


def test_inferred_structural_for_stable_abundant_oxide_insulators():
    primary, flags = classify(material(band_gap=5.0))  # e.g. a silicate or carbonate
    assert primary == ["structural_ceramic"]
    assert flags.iloc[0]["structural_inferred"]

    verified, vflags = classify(material(band_gap=5.0, k_vrh=200, g_vrh=150))
    assert verified == ["structural_ceramic"]
    assert not vflags.iloc[0]["structural_inferred"]


def test_inferred_structural_requires_no_elastic_data_oxygen_abundance_and_stability():
    primary, _ = classify(
        material(band_gap=5.0, k_vrh=36, g_vrh=21),  # measured and soft (portlandite-like)
        material(band_gap=5.0, min_abundance=1.0),  # scarce element
        material(band_gap=5.0, min_abundance=math.nan),  # abundance unknown
        material(band_gap=5.0, elements=["Ca", "F"]),  # no oxygen
        material(band_gap=5.0, e_above_hull=0.08),  # passes the gate but not the 0.05 cut
    )
    assert primary == ["unclassified"] * 5


def test_magnetic_excludes_insulating_ferromagnets_but_keeps_ferrimagnets():
    primary, flags = classify(
        material(elements=["Mn", "O"], ordering="FM", magnetization=5.0, band_gap=2.5),
        material(elements=["Fe", "O"], ordering="FiM", magnetization=4.0, band_gap=1.0),
        material(elements=["Fe", "O"], ordering="FM", magnetization=14.0, band_gap=0.0),
    )
    # Insulating FM is an MP artifact: falls through to its band-gap category instead.
    assert primary == ["electronic_optical", "magnetic", "magnetic"]
    assert not flags.iloc[0]["magnetic"]


def test_battery_rule_accepts_metallic_electrodes_and_rejects_minerals_and_alloys():
    li = {"working_ion_fraction": 0.25}
    primary, _ = classify(
        material(elements=["Li", "Ni", "O"], **li),  # LiNiO2: metallic in GGA, still an electrode
        material(elements=["Li", "Ti", "S"], **li),  # LiTiS2: sulfide framework
        material(elements=["Ca", "Fe", "Na", "O", "Si"], band_gap=2.5, **li),  # Ca spectator
        material(elements=["Fe", "Li"], **li),  # alloy: no anion framework
        material(elements=["Li", "Mn", "O"], e_above_hull=0.08, **li),  # outside the 0.05 cut
    )
    assert primary == ["energy", "energy", "electronic_optical", "unclassified", "unclassified"]


def test_structural_candidate_ignores_moduli():
    # Same composition with stiff, soft, unphysical or no moduli: candidacy never changes.
    rows = [
        material(band_gap=5.0),
        material(band_gap=5.0, k_vrh=200, g_vrh=150),
        material(band_gap=5.0, k_vrh=36, g_vrh=21),
        material(band_gap=5.0, k_vrh=77, g_vrh=-14),
    ]
    _, flags = classify(*rows)
    assert flags["structural_candidate"].tolist() == [True] * 4


def test_structural_candidate_metallic_branch():
    _, flags = classify(
        material(elements=["Fe"], min_abundance=56300),  # iron
        material(elements=["C", "Fe"], min_abundance=200, nonmetal_fraction=0.25),  # Fe3C
        material(elements=["Al", "Mg"], min_abundance=23300),  # Al-Mg alloy
        material(elements=["Fe", "Pt"], min_abundance=0.005),  # Pt is not a structural metal
        material(elements=["Al", "Li"], min_abundance=20),  # Li is not in the alloy list
        material(elements=["Cr", "Mn"], min_abundance=102),  # no base metal
        material(elements=["Fe", "Mo"], min_abundance=1.2),  # fails the 10 ppm floor
        material(elements=["Fe"], min_abundance=56300, band_gap=1.0),  # not metallic
        material(elements=["Fe"], min_abundance=56300, e_above_hull=0.08),  # not stable enough
    )
    assert flags["structural_candidate"].tolist() == [True, True, True] + [False] * 6


def test_unphysical_elastic_fit_falls_back_to_candidate_rule():
    # Aluminum (mp-134) reports G_VRH = -14 GPa; it used to end up unclassified.
    primary, flags = classify(material(elements=["Al"], min_abundance=82300, k_vrh=77, g_vrh=-14))
    assert primary == ["structural_metallic"]
    assert flags.iloc[0]["structural_inferred"]
    # A physical but soft fit still blocks inference (portlandite-like).
    primary, _ = classify(material(band_gap=5.0, k_vrh=36, g_vrh=21))
    assert primary == ["unclassified"]


def test_supply_gate_on_verified_path():
    stiff = {"k_vrh": 200, "g_vrh": 150, "band_gap": 1.0}  # stiff semiconductor, no inference
    _, flags = classify(
        material(**stiff),
        material(**stiff, cost=3000.0),  # precious-metal intermetallic: too expensive
        material(**stiff, min_abundance=0.005),  # Pt/Ru/Rh-scarce
        material(**stiff, cost=math.nan),  # price unknown
        material(**stiff, min_abundance=math.nan),  # abundance unknown
    )
    assert flags["structural_ceramic"].tolist() == [True, False, False, False, False]


def test_supply_gate_on_candidate_rule():
    _, flags = classify(
        material(band_gap=5.0),
        material(band_gap=5.0, cost=500.0),  # e.g. a scandium silicate
    )
    assert flags["structural_candidate"].tolist() == [True, False]


def test_metallic_vs_ceramic_split():
    stiff = {"k_vrh": 200, "g_vrh": 100}
    primary, flags = classify(
        material(elements=["Fe"], **stiff),  # iron
        material(elements=["C", "Fe"], nonmetal_fraction=0.25, **stiff),  # cementite Fe3C
        material(elements=["C", "Ti"], nonmetal_fraction=0.5, **stiff),  # TiC: half carbon
        material(elements=["Al", "O"], band_gap=6.0, **stiff),  # corundum
        material(elements=["Ru", "O"], cost=50.0, **stiff),  # metallic oxide, mostly O atoms
    )
    assert primary == [
        "structural_metallic",
        "structural_metallic",
        "structural_ceramic",
        "structural_ceramic",
        "structural_ceramic",
    ]
    # The two flags are exclusive.
    assert not (flags["structural_metallic"] & flags["structural_ceramic"]).any()


def test_candidate_metallic_branch_needs_metallic_composition():
    # TiN is metallic in DFT but half nitrogen: not a candidate alloy (and not a wide-gap oxide).
    _, flags = classify(material(elements=["N", "Ti"], nonmetal_fraction=0.5, min_abundance=19))
    assert not flags.iloc[0]["structural_candidate"]
