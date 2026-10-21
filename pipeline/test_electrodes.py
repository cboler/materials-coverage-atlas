import pandas as pd

from electrodes import electrode_sets, electrode_validation, framework_formula


def row(material_id, formula, elements, ion_fraction, e_above_hull=0.0):
    return {
        "material_id": material_id,
        "formula": formula,
        "elements": elements,
        "working_ion_fraction": ion_fraction,
        "e_above_hull": e_above_hull,
    }


MATERIALS = pd.DataFrame(
    [
        row("mp-1", "LiCoO2", ["Co", "Li", "O"], 0.25),  # electrode, lithiated: positive, flagged
        row("mp-2", "CoO2", ["Co", "O"], 0.0),  # empty framework: not a positive (no ion)
        row("mp-3", "LiSbO3", ["Li", "O", "Sb"], 0.2),  # electrode, no redox metal: missed
        row("mp-4", "LiFeO2", ["Fe", "Li", "O"], 0.25, 0.2),  # electrode above hull window
        row("mp-5", "LiMnO2", ["Li", "Mn", "O"], 0.25),  # not an electrode: negative, flagged
        row("mp-6", "Li2SO4", ["Li", "O", "S"], 0.29),  # not an electrode: negative, not flagged
        row("mp-7", "NaCoO2", ["Co", "Na", "O"], 0.25),  # framework CoO2 is an electrode host
        row("mp-8", "LiCl", ["Cl", "Li"], 0.5, 0.08),  # outside hull window: not a negative
        row("mp-9", "CaTiO3", ["Ca", "O", "Ti"], 0.0),  # no working ion: neither set
    ]
)
ELECTRODES = pd.DataFrame(
    {
        "working_ion": ["Li", "Li", "Li", "Ca"],
        "framework_formula": ["CoO2", "SbO3", "FeO2", "TiO3"],
        "material_ids": [["mp-1", "mp-2"], ["mp-3"], ["mp-4"], ["mp-9"]],
    }
)


def test_framework_formula_strips_every_working_ion():
    assert framework_formula("LiCoO2") == "CoO2"
    assert framework_formula("Li2MgFe2O4") == "FeO2"
    assert framework_formula("Li") is None


def test_positive_and_negative_sets():
    positive, negative = electrode_sets(MATERIALS, ELECTRODES)
    assert MATERIALS["material_id"][positive].tolist() == ["mp-1", "mp-3", "mp-4"]
    # mp-7's framework (CoO2) is an electrode host, so it is not a confident negative.
    assert MATERIALS["material_id"][negative].tolist() == ["mp-5", "mp-6"]


def test_precision_and_recall_counts():
    result = electrode_validation(MATERIALS, ELECTRODES)
    assert result["positives"] == 3
    assert result["positives_in_window"] == 2  # mp-4 sits above the 0.05 eV/atom window
    assert (result["true_positives"], result["false_negatives"]) == (1, 1)
    assert (result["negatives"], result["false_positives"]) == (2, 1)
    assert result["precision"] == 0.5
    assert result["recall"] == 0.5
    assert result["recall_all_positives"] == 0.333
    assert result["negatives_approximate"] is True
