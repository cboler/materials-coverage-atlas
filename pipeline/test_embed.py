import numpy as np

from embed import nearest_neighbors


def test_nearest_neighbors_ranks_by_feature_distance_and_skips_self():
    features = np.array([[0.0, 0.0], [5.0, 0.0], [1.0, 0.0], [0.0, 2.0], [0.0, 0.0]])
    # Index 4 duplicates index 0 (distance 0); then 2 (1.0), 3 (2.0), 1 (5.0).
    assert nearest_neighbors(features, 0, 3) == [4, 2, 3]


def test_nearest_neighbors_caps_k_at_dataset_size():
    features = np.array([[0.0], [1.0], [3.0]])
    assert nearest_neighbors(features, 2, 10) == [1, 0]
