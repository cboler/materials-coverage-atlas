"""Render the shareable coverage figure from ``public/data/atlas.json``.

    python pipeline/figure.py                  # writes public/figures/coverage-headline.{png,svg}
    python pipeline/figure.py --left Iron --right Calcite

Every number comes from the atlas file: each anchor's 20 nearest compounds (polymorphs grouped,
the same list the app shows), how many have elastic data, and the share of moduli-blind
structural candidates that never had stiffness calculated. ``build_atlas.py`` calls ``render``
after writing the atlas, so the figure always matches the data.
"""

from __future__ import annotations

import argparse
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
ATLAS_PATH = ROOT / "public" / "data" / "atlas.json"
OUT_DIR = ROOT / "public" / "figures"
SHOWN = 20  # formulas per anchor, as in the app's "Similar to" panel

# Light chart chrome from the validated reference palette (posts are usually read on white).
SURFACE, INK, INK_2, MUTED, HAS = "#fcfcfb", "#0b0b0b", "#52514e", "#898781", "#2a78d6"
DESCRIPTIONS = {"Portlandite": "the binder in cement", "Iron": "the base of steel"}


def neighbor_coverage(atlas: dict, anchor_name: str, shown: int = SHOWN) -> list[tuple[str, bool]]:
    """(formula, has elastic data) for an anchor's nearest formulas, nearest first."""
    anchor = next(a for a in atlas["anchors"] if a["name"] == anchor_name)
    formulas, k_vrh = atlas["columns"]["formula"], atlas["columns"]["k_vrh"]
    grouped: dict[str, bool] = {}
    for i in anchor.get("similar", []):
        f = formulas[i]
        grouped[f] = grouped.get(f, False) or k_vrh[i] is not None
    return list(grouped.items())[:shown]


def candidate_coverage(atlas: dict) -> tuple[int, float]:
    """(structural candidates, % that never had stiffness calculated)."""
    cols = atlas["columns"]
    flags = cols["structural_candidate"]
    count = sum(flags)
    never = sum(1 for f, k in zip(flags, cols["k_vrh"]) if f and k is None)
    return count, 100 * never / count if count else 0.0


def headline(left: str, n_left: int, right: str, n_right: int, total: int) -> str:
    def name(anchor: str) -> str:
        desc = DESCRIPTIONS.get(anchor)
        return f"{anchor.lower()}, {desc}," if desc else anchor.lower()

    fewer = "only " if n_right < n_left else ""
    return (
        f"Near {name(left)} {n_left} of the {total} most similar compounds have computed "
        f"stiffness; near {name(right)} {fewer}{n_right} do."
    )


def _mathtext(formula: str) -> str:
    return re.sub(r"(\d+(?:\.\d+)?)", r"$_{\1}$", formula)


def render(atlas_path: Path = ATLAS_PATH, out_dir: Path = OUT_DIR, left: str = "Iron", right: str = "Portlandite") -> dict:
    import matplotlib

    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    from matplotlib.lines import Line2D

    atlas = json.loads(Path(atlas_path).read_text(encoding="utf-8"))
    panels = [(name, neighbor_coverage(atlas, name)) for name in (left, right)]
    counts = [sum(has for _, has in items) for _, items in panels]
    total = len(panels[0][1])
    n_candidates, never_pct = candidate_coverage(atlas)
    version = atlas["meta"]["database_version"]
    title = headline(left, counts[0], right, counts[1], total)
    subtitle = (
        f"Across all {n_candidates:,} structural candidates (stable oxides and metals made of "
        f"common elements), {never_pct:.0f}% have never had stiffness calculated."
    )

    plt.rcParams.update({"font.family": ["Segoe UI", "DejaVu Sans"], "svg.fonttype": "path"})
    fig = plt.figure(figsize=(12, 6.75), dpi=200, facecolor=SURFACE)
    fig.text(0.04, 0.93, title, fontsize=19, fontweight="bold", color=INK, va="top", wrap=True)
    fig.text(0.04, 0.80, subtitle, fontsize=12.5, color=INK_2, va="top")
    legend = [
        Line2D([], [], marker="o", ls="", ms=9, mfc=HAS, mec=HAS, label="stiffness computed"),
        Line2D([], [], marker="o", ls="", ms=9, mfc=SURFACE, mec=MUTED, mew=1.5, label="never computed"),
    ]
    fig.legend(handles=legend, loc="upper left", bbox_to_anchor=(0.035, 0.75), ncol=2, frameon=False,
               fontsize=11, labelcolor=INK_2, handletextpad=0.3, columnspacing=1.6)

    for p, ((name, items), n) in enumerate(zip(panels, counts)):
        ax = fig.add_axes([0.04 + p * 0.48, 0.12, 0.44, 0.54])
        ax.set_axis_off()
        ax.set_xlim(0, 2)
        ax.set_ylim(10.6, -1.6)
        formula = atlas["columns"]["formula"][next(a["index"] for a in atlas["anchors"] if a["name"] == name)]
        label = ax.text(0, -1.1, name, fontsize=15, fontweight="bold", color=INK, va="center")
        # Placed against the name's rendered box, so it never collides or drifts.
        ax.annotate(_mathtext(formula), xy=(1, 0.5), xycoords=label, xytext=(8, 0),
                    textcoords="offset points", fontsize=13, color=MUTED, va="center")
        ax.text(2, -1.1, f"{n} of {len(items)} with stiffness data", fontsize=13, fontweight="bold",
                color=INK, va="center", ha="right")
        for k, (f, has) in enumerate(items):
            x, y = (k // 10) * 1.0, k % 10
            ax.plot(x + 0.04, y, "o", ms=8.5, mfc=HAS if has else SURFACE, mec=HAS if has else MUTED,
                    mew=1.5, clip_on=False)
            ax.text(x + 0.11, y, f"{k + 1}. {_mathtext(f)}", fontsize=10.5, color=INK if has else INK_2,
                    va="center")

    fig.text(
        0.04, 0.035,
        f"Nearest {total} compounds to each material across ~100 composition and property traits "
        f"(crystal variants grouped).\nData: Materials Project v{version} (materialsproject.org), "
        f"CC BY 4.0.  Figure: materials-coverage-atlas, {atlas['meta']['generated_at'][:10]}.",
        fontsize=9, color=MUTED, linespacing=1.5,
    )

    out_dir.mkdir(parents=True, exist_ok=True)
    paths = [out_dir / "coverage-headline.png", out_dir / "coverage-headline.svg"]
    for path in paths:
        fig.savefig(path, facecolor=SURFACE, metadata=None if path.suffix == ".png" else {"Date": None})
    plt.close(fig)
    return {"headline": title, "subtitle": subtitle, "counts": dict(zip((left, right), counts)), "paths": paths}


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--left", default="Iron")
    parser.add_argument("--right", default="Portlandite")
    args = parser.parse_args()
    result = render(left=args.left, right=args.right)
    print(result["headline"])
    print(result["subtitle"])
    for path in result["paths"]:
        print(f"Wrote {path}")
