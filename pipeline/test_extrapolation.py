import numpy as np

from extrapolation import BIN_LABELS, distance_bin, extrapolation


def test_distance_bin_edges():
    edges = np.array([1.0, 2.0, 3.0])
    assert distance_bin(np.array([0.5, 1.0, 1.5, 2.5, 3.0, 9.0]), edges).tolist() == [0, 0, 1, 2, 2, 3]


def test_extrapolation_flags_far_materials_and_never_ships_predictions():
    rng = np.random.default_rng(0)
    elastic = rng.normal(0, 1, size=(300, 4))
    near = rng.normal(0, 0.3, size=(20, 4))  # inside the elastic cloud
    far = rng.normal(0, 0.3, size=(20, 4)) + 15  # nowhere near any elastic data
    features = np.vstack([elastic, near, far])
    k_vrh = np.r_[50 + 20 * elastic[:, 0], np.zeros(40)]  # learnable target; no data for the rest
    usable = np.r_[np.ones(300, bool), np.zeros(40, bool)]

    result = extrapolation(features, k_vrh, usable)
    bins = result.pop("bins")
    assert (bins[:300] == -1).all()  # materials with elastic data have no indicator
    assert (bins[300:320] <= 1).all()
    assert (bins[320:] == len(BIN_LABELS) - 1).all()
    assert result["n_train"] + result["n_test"] == 300
    assert result["mae_gpa"] < result["baseline_mae_gpa"]
    assert sum(result["counts"]) == 40
    # Only summary numbers come back: nothing per material except the distance bin.
    assert not any(isinstance(v, np.ndarray) for v in result.values())
