import numpy as np
import pandas as pd

from provenance import entry_tier, legacy_number, novelty, tier_calibration


def test_legacy_number_decodes_new_ids_and_keeps_old_ones():
    assert legacy_number("mp-aaaaaaan") == 13  # iron
    assert legacy_number("mp-aaaaafwb") == 3953  # calcite
    assert legacy_number("mp-aaaaakjg") == 7000  # quartz
    assert legacy_number("mp-13") == 13
    assert legacy_number("mvc-12") == 12
    assert legacy_number("garbage") is None
    assert legacy_number("mp-AB1") is None


def test_entry_tier_edges():
    tiers = entry_tier(pd.Series([13, 999_999, 1_000_000, 1_499_999, 1_500_000, np.nan]))
    assert tiers.tolist() == [0, 0, 1, 1, 2, 0]


def test_tier_calibration_ignores_bulk_rebuild_dates():
    numbers = pd.Series([10, 20, 1_200_000, 2_000_000] + [500] * 20)
    created = pd.Series(
        pd.to_datetime(["2011-01-05", "2012-03-01", "2018-06-01", "2022-07-19"] + ["2017-07-18"] * 20, utc=True)
    )
    result = tier_calibration(numbers, created)
    assert result["rebuild_dates"] == ["2017-07-18"]
    assert result["median_created_year_by_tier"] == {
        "before ~2017": 2011,
        "~2017–2020": 2018,
        "~2020 onward": 2022,
    }


def test_novelty_separates_gap_fillers_from_crowders():
    rng = np.random.default_rng(1)
    older = rng.normal(0, 1, size=(400, 3))
    crowders = rng.normal(0, 0.2, size=(10, 3))  # dropped into the middle of the older cloud
    fillers = rng.normal(0, 0.2, size=(10, 3)) + 12  # far from everything older
    features = np.vstack([older, crowders, fillers])
    newer = np.r_[np.zeros(400, bool), np.ones(20, bool)]
    result = novelty(features, newer, k=5)
    assert result["newer"] == 20 and result["older"] == 400
    assert result["sparse"][:410].sum() == 0
    assert result["sparse"][410:].all()
    assert result["share_newer_sparse"] == 0.5
