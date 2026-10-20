"""Element crustal abundance and price, rolled up to per-material supply metrics.

Element data comes from the ``mendeleev`` package (crustal abundance in mg/kg, i.e. ppm by
mass, from the CRC Handbook; price in USD/kg as compiled in mendeleev's element table).

Per material:
    cost_usd_per_kg   Mass-fraction-weighted element price: the raw-element cost of 1 kg of the
                      compound. Ignores processing, so it is a floor, not a market price.
                      None if any constituent element has no price.
    min_abundance_ppm Crustal abundance of the scarcest constituent element (the supply
                      bottleneck). None if any constituent has no abundance value.
    scarcest_element  The element that sets min_abundance_ppm.
"""

from __future__ import annotations

from functools import cache

from pymatgen.core import Composition


@cache
def element_table() -> dict[str, tuple[float | None, float | None]]:
    """symbol -> (crustal abundance ppm, price USD/kg)."""
    from mendeleev.fetch import fetch_table

    table = fetch_table("elements")
    missing = {"symbol", "abundance_crust", "price_per_kg"} - set(table.columns)
    if missing:
        raise SystemExit(f"mendeleev element table lacks columns {missing}; upgrade mendeleev.")

    def clean(value):
        return None if value is None or value != value or value <= 0 else float(value)

    return {
        row.symbol: (clean(row.abundance_crust), clean(row.price_per_kg))
        for row in table.itertuples()
    }


def supply_metrics(composition: Composition) -> tuple[float | None, float | None, str | None]:
    """Return (cost USD/kg, min crustal abundance ppm, scarcest element) for one composition."""
    table = element_table()
    elements = composition.elements
    abundances, prices = zip(*(table.get(e.symbol, (None, None)) for e in elements))

    cost = None
    if None not in prices:
        cost = sum(composition.get_wt_fraction(e) * p for e, p in zip(elements, prices))

    if None in abundances:
        return cost, None, None
    min_abundance, scarcest = min(zip(abundances, (e.symbol for e in elements)))
    return cost, min_abundance, scarcest
