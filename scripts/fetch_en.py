"""Angielskie nazwy i opisy zagadek -> public/data/puzzles.en.json (wersja angielska gry).

Dla każdej zagadki z puli (i z kampanii partnerów) pobiera z Wikidata angielską etykietę, opis i link do
angielskiej Wikipedii, a z enwiki wstęp artykułu. Gdy czegoś brakuje, gra pokazuje polską wersję:
nazwa -> polska nazwa, opis -> krótki opis z Wikidata, link -> artykuł w polskiej Wikipedii.
Surowe odpowiedzi trafiają do data/raw/en.json, więc ponowne uruchomienie dociąga tylko nowe obiekty
(--refresh pobiera wszystko od nowa).
"""
import json
import sys
import urllib.parse
from pathlib import Path

from build_puzzles import short_extract
from fetch_wikidata import sparql
from wm import chunks, get_json

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "data" / "raw" / "en.json"
OUT = ROOT / "public" / "data" / "puzzles.en.json"


QUERY = """SELECT ?item ?label ?desc ?title WHERE {
  VALUES ?item { %s }
  OPTIONAL { ?item rdfs:label ?label FILTER(LANG(?label) = "en") }
  OPTIONAL { ?item schema:description ?desc FILTER(LANG(?desc) = "en") }
  OPTIONAL { ?page schema:about ?item ; schema:isPartOf <https://en.wikipedia.org/> ; schema:name ?title }
}"""


def save(raw: dict) -> None:
    RAW.write_text(json.dumps(raw, ensure_ascii=False, indent=0, sort_keys=True), "utf-8")


def fetch_extracts(titles: list[str]) -> dict:
    return get_json(
        "https://en.wikipedia.org/w/api.php",
        {"action": "query", "prop": "extracts", "exintro": 1, "explaintext": 1, "exchars": 700, "exlimit": 20, "redirects": 1, "titles": "|".join(titles), "format": "json", "formatversion": 2},
        retries=3,
    )


def main() -> None:
    refresh = "--refresh" in sys.argv
    puzzles = json.loads((ROOT / "public/data/puzzles.json").read_text("utf-8"))["puzzles"]
    sponsored = json.loads((ROOT / "public/data/sponsored.json").read_text("utf-8"))
    ids = sorted({p["id"] for p in puzzles} | {p["id"] for c in sponsored.get("campaigns", []) for p in c["puzzles"] if p["id"].startswith("Q")})
    raw: dict = {} if refresh or not RAW.exists() else json.loads(RAW.read_text("utf-8"))

    todo = [q for q in ids if q not in raw]
    print(f"Wikidata: {len(todo)} nowych obiektów z {len(ids)}")
    for part in chunks(todo, 150):
        res = sparql(QUERY % " ".join("wd:" + q for q in part))
        for q in part:
            raw[q] = {"label": "", "desc": "", "title": ""}
        for b in res["results"]["bindings"]:
            r = raw[b["item"]["value"].rsplit("/", 1)[1]]
            for src, dst in (("label", "label"), ("desc", "desc"), ("title", "title")):
                if src in b:
                    r[dst] = b[src]["value"]
        save(raw)

    need = [q for q in ids if raw.get(q, {}).get("title") and "extract" not in raw[q]]
    print(f"enwiki: {len(need)} wstępów do pobrania")
    by_title = {raw[q]["title"]: q for q in need}
    for part in chunks(list(by_title), 20):
        try:
            data = fetch_extracts(part)
        except RuntimeError:
            # enwiki bywa niedostępna (np. zablokowana sieć): zostawiamy to, co mamy; następne uruchomienie dociągnie resztę
            print("  ! enwiki nie odpowiada, pomijam pozostałe wstępy", file=sys.stderr)
            break
        q = data.get("query", {})
        back = {n["to"]: n["from"] for n in q.get("normalized", [])}
        back.update({r["to"]: back.get(r["from"], r["from"]) for r in q.get("redirects", [])})
        for page in q.get("pages", []):
            orig = back.get(page["title"], page["title"])
            if orig in by_title:
                raw[by_title[orig]]["extract"] = (page.get("extract") or "").strip()
        for t in part:
            raw[by_title[t]].setdefault("extract", "")
        save(raw)
    save(raw)


    out = {}
    for q in ids:
        r = raw.get(q)
        if not r:
            continue
        e = {}
        if r["label"]:
            e["name"] = r["label"][0].upper() + r["label"][1:]
        text = short_extract(r["extract"]) if r.get("extract") else ""
        if not text and r["desc"]:
            text = r["desc"][0].upper() + r["desc"][1:] + "."
        if text:
            e["extract"] = text
        if r["title"]:
            e["wiki"] = "https://en.wikipedia.org/wiki/" + urllib.parse.quote(r["title"].replace(" ", "_"), safe="/,()'!*:")
        if e:
            out[q] = e
    OUT.write_text(json.dumps({"puzzles": out}, ensure_ascii=False, separators=(",", ":")), "utf-8")
    n = len(ids)
    print(f"Zapisano {OUT.relative_to(ROOT)}: nazwy {sum('name' in v for v in out.values())}/{n}, opisy {sum('extract' in v for v in out.values())}/{n}, artykuły enwiki {sum('wiki' in v for v in out.values())}/{n}")


if __name__ == "__main__":
    main()
