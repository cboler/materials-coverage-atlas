import numpy as np

from embed import nearest_neighbors


def test_nearest_neighbors_ranks_by_feature_distance_and_skips_self():
    features = np.array([[0.0, 0.0], [5.0, 0.0], [1.0, 0.0], [0.0, 2.0], [0.0, 0.0]])
    # Index 4 duplicates index 0 (distance 0); then 2 (1.0), 3 (2.0), 1 (5.0).
    assert nearest_neighbors(features, 0, 3) == [4, 2, 3]


def test_nearest_neighbors_caps_k_at_dataset_size():
    features = np.array([[0.0], [1.0], [3.0]])
    assert nearest_neighbors(features, 2, 10) == [1, 0]


def test_nearest_neighbors_caps_entries_per_label():
    # Five points at increasing distance; the three nearest share a formula.
    features = np.array([[0.0], [1.0], [2.0], [3.0], [4.0], [5.0]])
    labels = np.array(["SiO2", "SiO2", "SiO2", "SiO2", "Al2SiO5", "SiO2"])
    assert nearest_neighbors(features, 0, 3, labels=labels, per_label=2) == [1, 2, 4]
    # Without a cap, polymorphs fill the list.
    assert nearest_neighbors(features, 0, 3) == [1, 2, 3]


def test_capped_neighbors_still_include_a_preferred_polymorph():
    # Only the farthest SiO2 entry has data (prefer); a cap of 2 alone would hide it.
    features = np.array([[0.0], [1.0], [2.0], [3.0], [4.0], [5.0]])
    labels = np.array(["SiO2", "SiO2", "SiO2", "SiO2", "Al2SiO5", "SiO2"])
    prefer = np.array([False, False, False, False, False, True])
    result = nearest_neighbors(features, 0, 3, labels=labels, per_label=2, prefer=prefer)
    assert result == [1, 2, 4, 5]  # nearest first, with entry 5 added for the SiO2 data
