"""Precision and recall of the battery-electrode rule against MP's insertion electrodes.

Positive set: every material in an MP insertion-electrode document (``material_ids``) whose
working ion is one the rule knows (Li, Na, K, Mg, Zn) and that contains that ion, i.e. the
intercalated states. The empty host framework is skipped because the rule requires the ion.

Negative set (approximate): materials within the rule's own hull window that contain a working
ion, never appear in any insertion electrode, and whose framework (the formula with every
working ion removed) is not the framework of any MP electrode for any ion. MP has computed
electrodes only for chemistries someone chose to study, so some of these are working
electrodes nobody has computed: precision measured this way is a lower bound.

Precision uses positives and negatives inside the same hull window (BATTERY_MAX_E_HULL), so
both sets face the rule's stability cut equally. Recall is reported inside that window and over
all positives, since many intercalated states sit above the hull.
"""

from __future__ import annotations

import pandas as pd
from pymatgen.core import Composition

from categories import BATTERY_MAX_E_HULL, WORKING_IONS, battery_candidate

ELECTRODE_COLUMNS = ["working_ion", "framework_formula", "material_ids"]


def _reduced(formula: str) -> str | None:
    try:
        return Composition(formula).reduced_formula
    except (ValueError, KeyError):
        return None


def framework_formula(formula: str, ions: set[str] = WORKING_IONS) -> str | None:
    """Reduced formula with every working-ion atom removed (None if nothing is left)."""
    comp = Composition(formula)
    rest = {el: amt for el, amt in comp.get_el_amt_dict().items() if el not in ions}
    return Composition(rest).reduced_formula if rest else None


def electrode_sets(df: pd.DataFrame, electrodes: pd.DataFrame) -> tuple[pd.Series, pd.Series]:
    """(positive, negative) boolean masks over ``df`` (needs material_id, elements, formula)."""
    ids_by_ion: dict[str, set[str]] = {}
    in_any = set()
    for ion, ids in zip(electrodes["working_ion"], electrodes["material_ids"]):
        ids = set(ids)
        in_any |= ids
        ids_by_ion.setdefault(ion, set()).update(ids)
    frameworks = {f for f in map(_reduced, electrodes["framework_formula"]) if f}

    elements = df["elements"].map(set)
    positive = pd.Series(False, index=df.index)
    for ion in WORKING_IONS & ids_by_ion.keys():
        positive |= df["material_id"].isin(ids_by_ion[ion]) & elements.map(lambda els: ion in els)

    pool = (
        elements.map(lambda els: bool(els & WORKING_IONS))
        & (df["e_above_hull"] <= BATTERY_MAX_E_HULL)
        & ~df["material_id"].isin(in_any)
    )
    negative = pool.copy()
    negative[pool] = ~df.loc[pool, "formula"].map(framework_formula).isin(frameworks)
    return positive, negative


def electrode_validation(df: pd.DataFrame, electrodes: pd.DataFrame) -> dict:
    """Confusion counts, precision and recall of the battery rule (see module docstring)."""
    positive, negative = electrode_sets(df, electrodes)
    flagged = battery_candidate(df)
    window = df["e_above_hull"] <= BATTERY_MAX_E_HULL
    pos_w = positive & window
    tp_w = int((flagged & pos_w).sum())
    fp = int((flagged & negative).sum())
    n_pos, n_pos_w, n_neg = int(positive.sum()), int(pos_w.sum()), int(negative.sum())

    def ratio(a: int, b: int) -> float | None:
        return round(a / b, 3) if b else None

    return {
        "source": "MP insertion electrodes (mpr.materials.insertion_electrodes)",
        "electrodes": int(len(electrodes)),
        "positives": n_pos,
        "positives_in_window": n_pos_w,
        "negatives": n_neg,
        "true_positives": tp_w,
        "false_positives": fp,
        "false_negatives": n_pos_w - tp_w,
        "precision": ratio(tp_w, tp_w + fp),
        "recall": ratio(tp_w, n_pos_w),
        "recall_all_positives": ratio(int((flagged & positive).sum()), n_pos),
        "negative_flag_rate": ratio(fp, n_neg),
        "hull_window": BATTERY_MAX_E_HULL,
        "negatives_approximate": True,
    }
