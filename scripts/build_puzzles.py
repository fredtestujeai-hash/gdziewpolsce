#!/usr/bin/env python3
"""Krok 3: łączy dane z Wikidata, Commons i Wikipedii w pulę zagadek.

Wejście:  data/raw/{wikidata,commons,plwiki}.json, public/map/{countries,wojewodztwa}.json
Wyjście:  public/data/puzzles.json   (+ raport odrzuceń na stderr)
          public/data/sponsored.json (tylko uzupełnienie pola `woj` w zagadkach partnerów)

Reguły jakości:
  * licencja zdjęcia musi pozwalać na użycie z atrybucją (CC0/PD/CC BY/CC BY-SA)
  * zdjęcie min. 800 px szerokości, proporcje 0.6–2.2 (bez panoram i map)
  * data powstania jednoznaczna (wiele dat różniących się o >20 lat = odrzut)
  * rok w przedziale MIN_YEAR..MAX_YEAR, punkt wewnątrz granic Polski
  * jeden obiekt na zdjęcie i na ~150 m (kompleksy budynków)
  * bez instytucji (muzeum, ośrodek — data założenia zamiast budowy) i cmentarzy

Każda zagadka dostaje pole `woj` (np. „małopolskie”): województwo wyznaczone przez sprawdzenie
punktu w wielokątach z public/map/wojewodztwa.json — tych samych, które gra podświetla
po użyciu podpowiedzi „Województwo”.
"""
import json
import math
import re
import sys
import urllib.parse
from collections import Counter
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "data" / "raw"
OUT = ROOT / "public" / "data" / "puzzles.json"
SPONSORED = ROOT / "public" / "data" / "sponsored.json"
EXCLUDE = ROOT / "data" / "exclude.txt"  # ręczna czarna lista QID (jeden na linię)

MIN_YEAR = 1000
MAX_YEAR = date.today().year
BAD_FILE_WORDS = re.compile(
    r"(map|mapa|plan|herb|logo|coat|scheme|schemat|rzut|widok_z_lotu|aerial|interior|wnętrze|wnetrze|ołtarz|oltarz|tablica|plaque"
    r"|butelk|bottle|podstawk|etykiet|kufel|beer|kadź|kadz|nagrob|nagrób|napis|epitaf|witra|stained|organy|fresk|polichromi|sklepieni|ceiling)",
    re.I,
)
# Kategorie, w których zdjęcie i data zwykle nie dotyczą budynku (np. browar = data założenia firmy, zdjęcie butelek)
EXCLUDED_CATEGORIES = {"browar"}
# Instytucje (data = założenie instytucji, nie budowa) i cmentarze (trudne do rozpoznania ze zdjęcia)
EXCLUDED_NAMES = re.compile(r"^(Ośrodek|Muzeum|Fundacja|Instytut|Stowarzyszenie|Cmentarz|cmentarz|Kirkut|kirkut)")
# Progi trudności wg liczby wersji językowych Wikipedii
EASY_SITELINKS = 9
MEDIUM_SITELINKS = 4
NAME_LOOKS_LIKE_QID = re.compile(r"^Q\d+$")


def license_ok(lic: str) -> bool:
    l = (lic or "").lower()
    if "nc" in l.split("-") or "nd" in l.split("-") or "fair use" in l:
        return False
    return any(k in l for k in ("cc0", "public domain", "pd", "cc by", "cc-by", "gfdl", "fal", "attribution"))


def load_poland_polygon():
    countries = json.loads((ROOT / "public" / "map" / "countries.json").read_text())
    for f in countries["features"]:
        if f["properties"]["id"] == "POL":
            g = f["geometry"]
            return g["coordinates"] if g["type"] == "MultiPolygon" else [g["coordinates"]]
    raise SystemExit("Brak POL w countries.json — uruchom najpierw `npm run map`")


def in_ring(lon, lat, ring):
    inside = False
    j = len(ring) - 1
    for i in range(len(ring)):
        xi, yi = ring[i]
        xj, yj = ring[j]
        if (yi > lat) != (yj > lat) and lon < (xj - xi) * (lat - yi) / (yj - yi) + xi:
            inside = not inside
        j = i
    return inside


def in_poland(lat, lon, polys):
    # 3 km tolerancji na nadmorskie latarnie itp. — sprawdzamy też punkty przesunięte
    d = 0.03
    for dlat, dlon in ((0, 0), (d, 0), (-d, 0), (0, d), (0, -d)):
        for poly in polys:
            if in_ring(lon + dlon, lat + dlat, poly[0]) and not any(in_ring(lon + dlon, lat + dlat, h) for h in poly[1:]):
                return True
    return False


def load_voivodeships():
    path = ROOT / "public" / "map" / "wojewodztwa.json"
    if not path.exists():
        raise SystemExit("Brak public/map/wojewodztwa.json — uruchom najpierw `npm run map`")
    out = []
    for f in json.loads(path.read_text())["features"]:
        g = f["geometry"]
        out.append((f["properties"]["name"], g["coordinates"] if g["type"] == "MultiPolygon" else [g["coordinates"]]))
    return out


def voivodeship(lat, lon, vois):
    """Nazwa województwa dla punktu. Punkty tuż za obrysem (latarnie, falochrony, brzeg rzeki
    granicznej) dostają województwo, którego granica jest najbliżej."""
    for name, polys in vois:
        for poly in polys:
            if in_ring(lon, lat, poly[0]) and not any(in_ring(lon, lat, h) for h in poly[1:]):
                return name
    k = math.cos(math.radians(lat))
    best = min(
        ((((x - lon) * k) ** 2 + (y - lat) ** 2, name) for name, polys in vois for poly in polys for x, y in poly[0]),
        default=(0, ""),
    )
    return best[1]


def km(a, b):
    r = 6371.0
    p1, p2 = math.radians(a[0]), math.radians(b[0])
    dp, dl = p2 - p1, math.radians(b[1] - a[1])
    h = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(h))


def clean_author(a: str) -> str:
    a = (a or "").strip()
    if not a or re.search(r"unknown|nieznany", a, re.I):
        return "autor nieznany"
    return a


ABBREV = {"ul", "pl", "al", "św", "r", "w", "ok", "tzw", "im", "ks", "gen", "m.in", "in", "tj", "np", "bł", "abp", "bp", "o", "s", "ss", "wsp", "dr", "prof", "inż", "arch", "pw", "wyd", "zm", "ur", "ob", "pn", "płd", "wsch", "zach", "n.p.m", "p.n.e", "n.e", "jw", "itd", "itp", "tys", "mln", "proj"}


def sentence_ends(text: str):
    """Pozycje końców zdań, z pominięciem kropek po polskich skrótach i inicjałach."""
    for m in re.finditer(r"[.!?…](?=\s+[A-ZĄĆĘŁŃÓŚŹŻ0-9„\"])", text):
        word = re.search(r"([\w.]+)$", text[: m.start()])
        w = (word.group(1) if word else "").lower()
        if w in ABBREV or (len(w) == 1 and w.isalpha()) or re.fullmatch(r"[ivxlcdm]+", w):
            continue
        yield m.end()


def short_extract(text: str, limit: int = 380) -> str:
    text = re.sub(r"\s+", " ", text or "").strip()
    text = re.sub(r"\s*\([^()]*\)", "", text)  # usuń nawiasy z wymową/datami — krócej i czytelniej
    text = re.sub(r"\s*\[[^\]]*\]", "", text)
    text = text.replace(" ,", ",")
    ends = [e for e in sentence_ends(text + " A") if e <= limit]
    if ends:
        return text[: ends[-1]].strip()
    if len(text) <= limit:
        return text.rstrip(". …") + "."
    cut = text[:limit].rsplit(" ", 1)[0]
    return cut.rstrip(",;: ") + "…"


def thumb_url(url: str) -> str:
    """Kanoniczny adres miniatury na upload.wikimedia.org, bez parametrów śledzących."""
    url = url.split("?", 1)[0]
    return url.replace("https://thumb.wikimedia.org/", "https://upload.wikimedia.org/")


def main():
    items = json.loads((RAW / "wikidata.json").read_text())
    commons = json.loads((RAW / "commons.json").read_text())
    plwiki = json.loads((RAW / "plwiki.json").read_text()) if (RAW / "plwiki.json").exists() else {}
    exclude = set(EXCLUDE.read_text().split()) if EXCLUDE.exists() else set()
    poland = load_poland_polygon()
    vois = load_voivodeships()
    rejected = Counter()

    ok = []
    for it in items:
        if it["qid"] in exclude:
            rejected["czarna lista"] += 1
            continue
        title = urllib.parse.unquote(it["wiki"].rsplit("/wiki/", 1)[1]).replace("_", " ")
        extract = plwiki.get(title, "")
        # Gra promuje miejsca, które można odwiedzić — pomijamy obiekty nieistniejące
        if it.get("demolished") or re.search(r"nieistniejąc|nie istnieje|nie zachował", extract[:250], re.I):
            rejected["nie istnieje"] += 1
            continue
        if it["category"] in EXCLUDED_CATEGORIES or EXCLUDED_NAMES.match(it["name"]):
            rejected["wykluczona kategoria"] += 1
            continue
        if NAME_LOOKS_LIKE_QID.match(it["name"]):
            rejected["brak polskiej nazwy"] += 1
            continue
        years = sorted(it["years"])
        if max(years) - min(years) > 20:
            rejected["niejednoznaczna data"] += 1
            continue
        year = years[0]
        if not (MIN_YEAR <= year <= MAX_YEAR):
            rejected["rok poza zakresem"] += 1
            continue
        if not in_poland(it["lat"], it["lon"], poland):
            rejected["poza granicami"] += 1
            continue
        if BAD_FILE_WORDS.search(it["image"]) or not re.search(r"\.(jpe?g|png|webp|tiff?)$", it["image"], re.I):
            rejected["nieodpowiedni plik"] += 1
            continue
        c = commons.get(it["image"])
        if not c:
            rejected["brak danych Commons"] += 1
            continue
        if not license_ok(c["license"]):
            rejected["licencja"] += 1
            continue
        w, h = c.get("width") or 0, c.get("height") or 0
        if w < 800 or not h or not (0.6 <= w / h <= 2.2):
            rejected["rozmiar/proporcje"] += 1
            continue
        ok.append(
            {
                "id": it["qid"],
                "name": it["name"],
                "category": it["category"],
                "place": it["place"] if it["place"] != it["name"] and not NAME_LOOKS_LIKE_QID.match(it["place"]) else "",
                "lat": it["lat"],
                "lon": it["lon"],
                "year": year,
                "woj": voivodeship(it["lat"], it["lon"], vois),
                "img": thumb_url(c["thumb"]),
                "imgW": w,
                "imgH": h,
                "author": clean_author(c["author"]),
                "license": c["license"],
                "licenseUrl": c["licenseUrl"],
                "filePage": c["page"],
                "wiki": it["wiki"],
                "extract": short_extract(extract),
                "_sl": it["sitelinks"],
                "_curated": bool(it.get("curated")),
            }
        )

    # Deduplikacja: to samo zdjęcie albo obiekty <150 m od siebie -> zostaje bardziej znany
    ok.sort(key=lambda p: -p["_sl"])
    seen_img, kept = set(), []
    for p in ok:
        if not p["extract"]:
            rejected["brak opisu w Wikipedii"] += 1
            continue
        if p["img"] in seen_img:
            rejected["duplikat zdjęcia"] += 1
            continue
        # obiekty dodane ręcznie (data/curated.json) zostają nawet tuż obok innej zagadki, np. zamek na Wawelu przy katedrze
        if not p["_curated"] and any(abs(p["lat"] - q["lat"]) < 0.002 and km((p["lat"], p["lon"]), (q["lat"], q["lon"])) < 0.15 for q in kept):
            rejected["duplikat lokalizacji"] += 1
            continue
        seen_img.add(p["img"])
        kept.append(p)

    # Trudność wg rozpoznawalności (liczba wersji językowych Wikipedii)
    for p in kept:
        p["difficulty"] = 1 if p["_sl"] >= EASY_SITELINKS else (2 if p["_sl"] >= MEDIUM_SITELINKS else 3)
        del p["_sl"], p["_curated"]
    kept.sort(key=lambda p: p["id"])

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(
        json.dumps(
            {"version": 1, "generated": date.today().isoformat(), "puzzles": kept},
            ensure_ascii=False,
            separators=(",", ":"),
        )
    )
    # Zagadki partnerów są edytowane ręcznie — uzupełniamy im tylko województwo
    if SPONSORED.exists():
        sp = json.loads(SPONSORED.read_text())
        for c in sp.get("campaigns", []):
            for p in c.get("puzzles", []):
                p["woj"] = voivodeship(p["lat"], p["lon"], vois)
        SPONSORED.write_text(json.dumps(sp, ensure_ascii=False, indent=2) + "\n")

    print(f"Pula: {len(kept)} zagadek -> {OUT}", file=sys.stderr)
    print("Trudność:", dict(Counter(p["difficulty"] for p in kept)), file=sys.stderr)
    print("Województwa:", dict(Counter(p["woj"] for p in kept).most_common()), file=sys.stderr)
    print("Kategorie:", dict(Counter(p["category"] for p in kept).most_common()), file=sys.stderr)
    print("Odrzucone:", dict(rejected.most_common()), file=sys.stderr)
    decades = Counter((p["year"] // 100) + 1 for p in kept)
    print("Wieki:", dict(sorted(decades.items())), file=sys.stderr)


if __name__ == "__main__":
    main()
