#!/usr/bin/env python3
"""Krok 1 pipeline'u danych: pobiera kandydatów na zagadki z Wikidata.

Dla każdej klasy obiektów (zamek, kościół, ratusz, ...) pyta Wikidata SPARQL
o obiekty w Polsce, które mają: zdjęcie (P18), współrzędne (P625),
datę powstania (P571) z dokładnością co najmniej do roku oraz artykuł
w polskiej Wikipedii. Wynik: data/raw/wikidata.json

Użycie:  python3 scripts/fetch_wikidata.py [--min-sitelinks 3]
"""
import argparse
import json
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "data" / "raw" / "wikidata.json"
ENDPOINT = "https://query.wikidata.org/sparql"
UA = "PinezkaDataBuilder/0.1 (open-source educational game; data build script)"

# QID klasy -> kategoria wyświetlana w grze
CLASSES = {
    "Q23413": "zamek",
    "Q17715832": "ruiny zamku",
    "Q16560": "pałac",
    "Q879050": "dwór",
    "Q1802963": "rezydencja",
    "Q3950": "willa",
    "Q16970": "kościół",
    "Q1088552": "kościół",
    "Q2977": "katedra",
    "Q56242215": "katedra",
    "Q163687": "bazylika",
    "Q120560": "bazylika",
    "Q44613": "klasztor",
    "Q160742": "opactwo",
    "Q108325": "kaplica",
    "Q2031836": "cerkiew",
    "Q34627": "synagoga",
    "Q32815": "meczet",
    "Q25550691": "ratusz",
    "Q543654": "ratusz",
    "Q82117": "brama miejska",
    "Q57821": "fortyfikacja",
    "Q1785071": "fort",
    "Q12518": "wieża",
    "Q1440300": "wieża widokowa",
    "Q274153": "wieża ciśnień",
    "Q39715": "latarnia morska",
    "Q12280": "most",
    "Q12323": "zapora",
    "Q11303": "wieżowiec",
    "Q483110": "stadion",
    "Q24354": "teatr",
    "Q1060829": "sala koncertowa",
    "Q55488": "dworzec",
    "Q131734": "browar",
    "Q1137809": "sąd",
    "Q35112127": "budynek historyczny",
    "Q41176": "budynek",
    "Q4989906": "pomnik",
    "Q4156067": "pałac",
    "Q483453": "fontanna",
    "Q1763828": "hala",
    "Q240854": "hala",
    "Q570116": "atrakcja turystyczna",
    "Q811165": "zabytek",  # szeroka klasa — na końcu, żeby nie nadpisywać kategorii
}

# Ręcznie wybrane obiekty (np. bardzo znane, ale z nieprecyzyjną datą w Wikidata).
# data/curated.json: [{"qid": "Q...", "year": 1627, "note": "..."}] — rok z pliku wygrywa.
CURATED = ROOT / "data" / "curated.json"
CURATED_QUERY = """
SELECT ?item ?itemLabel ?itemDescription ?coord ?img ?sl ?article ?locLabel WHERE {
  VALUES ?item { %(ids)s }
  ?item wdt:P18 ?img; wdt:P625 ?coord; wikibase:sitelinks ?sl.
  ?article schema:about ?item; schema:isPartOf <https://pl.wikipedia.org/>.
  OPTIONAL { ?item wdt:P131 ?loc. }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "pl,en". }
}
"""

QUERY = """
SELECT ?item ?itemLabel ?itemDescription ?coord ?img ?t ?p ?sl ?article ?locLabel WHERE {
  ?item wdt:P31 wd:%(cls)s; wdt:P17 wd:Q36; wdt:P18 ?img; wdt:P625 ?coord;
        wikibase:sitelinks ?sl.
  FILTER(?sl >= %(minsl)d)
  ?item p:P571 ?st. ?st psv:P571 ?tv. ?tv wikibase:timeValue ?t; wikibase:timePrecision ?p.
  FILTER(?p >= 9)
  ?article schema:about ?item; schema:isPartOf <https://pl.wikipedia.org/>.
  OPTIONAL { ?item wdt:P131 ?loc. }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "pl,en". }
}
"""


def sparql(query: str, retries: int = 4) -> dict:
    data = urllib.parse.urlencode({"query": query}).encode()
    for attempt in range(retries):
        req = urllib.request.Request(
            ENDPOINT,
            data=data,
            headers={"User-Agent": UA, "Accept": "application/sparql-results+json"},
        )
        try:
            with urllib.request.urlopen(req, timeout=120) as r:
                return json.load(r)
        except Exception as e:  # noqa: BLE001
            wait = 10 * (attempt + 1)
            print(f"  ! {e} — ponawiam za {wait}s", file=sys.stderr)
            time.sleep(wait)
    raise RuntimeError("SPARQL nie odpowiada")


def parse_point(wkt: str):
    # "Point(19.935 50.054)" -> (lat, lon)
    lon, lat = wkt[wkt.index("(") + 1 : wkt.index(")")].split()
    return round(float(lat), 5), round(float(lon), 5)


def parse_year(t: str):
    # "1333-01-01T00:00:00Z" ; lata p.n.e. zaczynają się od "-"
    neg = t.startswith("-")
    y = int(t.lstrip("-+").split("-")[0])
    return -y if neg else y


def fetch_curated(items: dict[str, dict]) -> None:
    if not CURATED.exists():
        return
    curated = {c["qid"]: c for c in json.loads(CURATED.read_text())}
    ids = " ".join("wd:" + q for q in curated)
    res = sparql(CURATED_QUERY % {"ids": ids})
    for b in res["results"]["bindings"]:
        qid = b["item"]["value"].rsplit("/", 1)[-1]
        if qid in items and items[qid].get("curated"):
            continue
        lat, lon = parse_point(b["coord"]["value"])
        c = curated[qid]
        items[qid] = {
            "qid": qid,
            "name": c.get("name") or b["itemLabel"]["value"],
            "description": b.get("itemDescription", {}).get("value", ""),
            "category": c.get("category", items.get(qid, {}).get("category", "zabytek")),
            "lat": lat,
            "lon": lon,
            "years": [c["year"]],
            "image": c.get("image") or urllib.parse.unquote(b["img"]["value"].rsplit("/", 1)[-1]),
            "sitelinks": int(b["sl"]["value"]),
            "wiki": b["article"]["value"],
            "place": b.get("locLabel", {}).get("value", ""),
            "curated": True,
        }
    print(f"Wyselekcjonowane ręcznie: {len(curated)}", file=sys.stderr)


def mark_demolished(items: dict[str, dict]) -> None:
    """Oznacza obiekty, które już nie istnieją (P576 — data rozbiórki/likwidacji)."""
    qids = sorted(items)
    for i in range(0, len(qids), 300):
        batch = " ".join("wd:" + q for q in qids[i : i + 300])
        res = sparql(f"SELECT DISTINCT ?item WHERE {{ VALUES ?item {{ {batch} }} ?item wdt:P576 ?d. }}")
        for b in res["results"]["bindings"]:
            items[b["item"]["value"].rsplit("/", 1)[-1]]["demolished"] = True
        time.sleep(1)
    print(f"Nieistniejące: {sum(1 for i in items.values() if i.get('demolished'))}", file=sys.stderr)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--min-sitelinks", type=int, default=3)
    ap.add_argument("--only-demolished", action="store_true", help="tylko uzupełnij flagę 'demolished'")
    ap.add_argument("--only", help="pobierz tylko wskazane klasy, np. Q23413,Q16560")
    args = ap.parse_args()

    items: dict[str, dict] = {}
    if OUT.exists():  # pozwala wznowić przerwane pobieranie
        items = {i["qid"]: i for i in json.loads(OUT.read_text())}

    if args.only_demolished:
        mark_demolished(items)
        OUT.write_text(json.dumps(list(items.values()), ensure_ascii=False, indent=1))
        return

    classes = CLASSES
    if args.only:
        classes = {q: CLASSES[q] for q in args.only.split(",")}

    for cls, category in classes.items():
        print(f"{cls} ({category}) ...", file=sys.stderr)
        res = sparql(QUERY % {"cls": cls, "minsl": args.min_sitelinks})
        n = 0
        for b in res["results"]["bindings"]:
            qid = b["item"]["value"].rsplit("/", 1)[-1]
            year = parse_year(b["t"]["value"])
            lat, lon = parse_point(b["coord"]["value"])
            img = urllib.parse.unquote(b["img"]["value"].rsplit("/", 1)[-1])
            rec = items.get(qid)
            if rec is None:
                rec = items[qid] = {
                    "qid": qid,
                    "name": b["itemLabel"]["value"],
                    "description": b.get("itemDescription", {}).get("value", ""),
                    "category": category,
                    "lat": lat,
                    "lon": lon,
                    "years": [],
                    "image": img,
                    "sitelinks": int(b["sl"]["value"]),
                    "wiki": b["article"]["value"],
                    "place": b.get("locLabel", {}).get("value", ""),
                }
                n += 1
            if year not in rec["years"]:
                rec["years"].append(year)
        print(f"  +{n} (razem {len(items)})", file=sys.stderr)
        OUT.parent.mkdir(parents=True, exist_ok=True)
        OUT.write_text(json.dumps(list(items.values()), ensure_ascii=False, indent=1))
        time.sleep(2)  # bądźmy uprzejmi dla serwera

    fetch_curated(items)
    mark_demolished(items)
    OUT.write_text(json.dumps(list(items.values()), ensure_ascii=False, indent=1))
    print(f"Zapisano {len(items)} obiektów do {OUT}", file=sys.stderr)


if __name__ == "__main__":
    main()
