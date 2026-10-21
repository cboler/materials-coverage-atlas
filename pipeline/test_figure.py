import json

from figure import candidate_coverage, headline, neighbor_coverage, render

ATLAS = {
    "meta": {"database_version": "2026.09.28", "generated_at": "2026-10-20T00:00:00+00:00"},
    "columns": {
        "formula": ["Fe", "Fe", "Fe3Ni", "Ca(HO)2", "Ca(HO)2", "Ca3Al2(HO)12", "MnFe4"],
        "k_vrh": [170, None, 180, None, 36, None, None],
        "structural_candidate": [1, 1, 0, 1, 1, 0, 0],
    },
    "anchors": [
        {"name": "Iron", "index": 0, "similar": [1, 2, 6]},
        {"name": "Portlandite", "index": 3, "similar": [4, 5]},
    ],
}


def test_neighbor_coverage_groups_polymorphs_like_the_app():
    assert neighbor_coverage(ATLAS, "Iron") == [("Fe", False), ("Fe3Ni", True), ("MnFe4", False)]
    # A formula counts as covered when any of its listed polymorphs has data.
    assert neighbor_coverage(ATLAS, "Portlandite") == [("Ca(HO)2", True), ("Ca3Al2(HO)12", False)]
    assert len(neighbor_coverage(ATLAS, "Iron", shown=2)) == 2


def test_candidate_coverage_counts_never_calculated():
    assert candidate_coverage(ATLAS) == (4, 50.0)


def test_headline_is_built_from_the_counts():
    assert headline("Iron", 8, "Portlandite", 2, 20) == (
        "Near iron, the base of steel, 8 of the 20 most similar compounds have computed stiffness; "
        "near portlandite, the binder in cement, only 2 do."
    )
    assert "only" not in headline("Iron", 2, "Calcite", 3, 20)


def test_render_writes_png_and_svg_with_attribution(tmp_path):
    path = tmp_path / "atlas.json"
    path.write_text(json.dumps(ATLAS), encoding="utf-8")
    result = render(path, tmp_path / "out")
    png, svg = result["paths"]
    assert png.read_bytes()[:8] == b"\x89PNG\r\n\x1a\n"
    assert svg.stat().st_size > 1000
    assert result["counts"] == {"Iron": 1, "Portlandite": 1}
