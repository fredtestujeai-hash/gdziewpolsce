#!/usr/bin/env python3
"""Buduje warstwę miejscowości dla mapy: punkty BEZ nazw, w trzech rangach.

  1 — miasta wojewódzkie (siedziby wojewody lub sejmiku: 18 miast)
  2 — siedziby powiatów i miasta na prawach powiatu
  3 — siedziby gmin

Źródło: Wikidata (CC0). Dla gmin bierzemy współrzędne siedziby (P36), a gdy jej
brak — współrzędne samej gminy (w Wikidata niemal zawsze wskazują siedzibę:
mediana różnicy 0,35 km).

Wyjście: public/map/places.json  {"places": [[lon, lat, ranga], ...]}
Użycie:  python3 scripts/fetch_places.py
"""
import json
import sys
from pathlib import Path

from build_puzzles import in_poland, km, load_poland_polygon
from fetch_wikidata import parse_point, sparql

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "public" / "map" / "places.json"

Q_VOIVODESHIP = """
SELECT DISTINCT ?s ?sc WHERE {
  ?v wdt:P31 wd:Q150093; wdt:P36 ?s. ?s wdt:P625 ?sc.
  FILTER NOT EXISTS { ?v wdt:P576 ?x }
}"""

Q_POWIAT = """
SELECT DISTINCT ?s ?sc WHERE {
  { ?p wdt:P31 wd:Q247073; wdt:P17 wd:Q36; wdt:P36 ?s. ?s wdt:P625 ?sc. FILTER NOT EXISTS { ?p wdt:P576 ?x } }
  UNION
  { ?s wdt:P31 wd:Q925381; wdt:P625 ?sc. FILTER NOT EXISTS { ?s wdt:P576 ?x } }
}"""

# gmina miejska, wiejska, miejsko-wiejska (+ ogólna klasa „gmina”)
Q_GMINA = """
SELECT ?g ?gc ?sc WHERE {
  VALUES ?c { wd:Q2616791 wd:Q3504085 wd:Q3491915 wd:Q15334 }
  ?g wdt:P31 ?c; wdt:P17 wd:Q36; wdt:P625 ?gc.
  OPTIONAL { ?g wdt:P36 ?s. ?s wdt:P625 ?sc. }
  FILTER NOT EXISTS { ?g wdt:P576 ?x }
}"""

# Wikidata podaje dla woj. lubuskiego tylko Gorzów (siedziba wojewody); Zielona Góra
# jest siedzibą sejmiku, więc dopisujemy ją ręcznie (szer., dług.).
EXTRA_VOIVODESHIP_CAPITALS = [(51.9356, 15.5062)]

# Punkty bliżej niż tyle km uznajemy za tę samą miejscowość
SAME_PLACE_KM = 2.5


def points(query: str, key: str = "s") -> dict[str, tuple[float, float]]:
    out: dict[str, tuple[float, float]] = {}
    for b in sparql(query)["results"]["bindings"]:
        out.setdefault(b[key]["value"], parse_point(b["sc"]["value"]))
    return out


def main():
    poland = load_poland_polygon()

    woj = list(points(Q_VOIVODESHIP).values()) + EXTRA_VOIVODESHIP_CAPITALS
    powiat = list(points(Q_POWIAT).values())

    gminy: dict[str, tuple[float, float]] = {}
    for b in sparql(Q_GMINA)["results"]["bindings"]:
        own = parse_point(b["gc"]["value"])
        seat = parse_point(b["sc"]["value"]) if "sc" in b else None
        # siedziba daleko od gminy = błąd w danych; wtedy zostają współrzędne gminy
        pt = seat if seat and km(seat, own) < 30 else own
        gminy.setdefault(b["g"]["value"], pt)

    kept: list[tuple[float, float, int]] = []
    grid: dict[tuple[int, int], list[tuple[float, float]]] = {}

    def near_existing(p):
        cx, cy = int(p[0] * 20), int(p[1] * 12)  # komórki ~5,5 km
        for dx in (-1, 0, 1):
            for dy in (-1, 0, 1):
                for q in grid.get((cx + dx, cy + dy), ()):
                    if km(p, q) < SAME_PLACE_KM:
                        return True
        return False

    counts = {1: 0, 2: 0, 3: 0}
    # od najwyższej rangi: miejscowość dostaje najwyższą rangę, jaką pełni
    for rank, pts in ((1, woj), (2, powiat), (3, list(gminy.values()))):
        for p in pts:
            if not in_poland(p[0], p[1], poland) or near_existing(p):
                continue
            grid.setdefault((int(p[0] * 20), int(p[1] * 12)), []).append(p)
            kept.append((round(p[1], 4), round(p[0], 4), rank))
            counts[rank] += 1

    OUT.write_text(json.dumps({"places": kept}, separators=(",", ":")))
    print(
        f"Miejscowości: {len(kept)} -> {OUT}\n"
        f"  wojewódzkie: {counts[1]} (źródło: {len(woj)})\n"
        f"  powiatowe:   {counts[2]} (źródło: {len(powiat)})\n"
        f"  gminne:      {counts[3]} (źródło: {len(gminy)})",
        file=sys.stderr,
    )
    if counts[1] != 18:
        print("UWAGA: oczekiwano 18 miast wojewódzkich", file=sys.stderr)


if __name__ == "__main__":
    main()
