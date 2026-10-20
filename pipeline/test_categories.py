import math

import pandas as pd

from categories import assign_categories

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
    }
    return {**base, **overrides}


def classify(*rows):
    primary, flags = assign_categories(pd.DataFrame(rows))
    return primary.tolist(), flags


def test_each_rule_in_isolation():
    primary, _ = classify(
        material(k_vrh=200, g_vrh=150),  # stiff, no gap
        material(elements=["Fe"], ordering="FM", magnetization=2.2),
        material(elements=["Co", "Li", "O"], band_gap=2.5),  # battery cathode chemistry
        material(band_gap=1.4),  # PV window
        material(band_gap=3.0),  # semiconductor window
        material(),  # metal, no data
    )
    assert primary == [
        "structural",
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
    # Ferromagnet with elastic data: magnetic wins, structural still flagged.
    primary, flags = classify(
        material(elements=["Fe"], ordering="FM", magnetization=2.2, k_vrh=170, g_vrh=80)
    )
    assert primary == ["magnetic"]
    assert flags.iloc[0]["structural"]


def test_rejects_weak_or_unphysical_elastic_data_and_antiferromagnets():
    primary, _ = classify(
        material(k_vrh=40, g_vrh=10),
        material(k_vrh=-5, g_vrh=60),
        material(k_vrh=200, g_vrh=900),
        material(elements=["Mn", "O"], ordering="AFM", magnetization=0.0),
        material(elements=["Li", "Co", "O"], band_gap=0.0),  # metallic: not an electrode candidate
    )
    assert primary == ["unclassified"] * 5
