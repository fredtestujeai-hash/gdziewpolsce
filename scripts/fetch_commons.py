#!/usr/bin/env python3
"""Krok 2: dla każdego zdjęcia pobiera z Wikimedia Commons licencję, autora
i adres miniatury, a z polskiej Wikipedii krótki wstęp artykułu.

Wejście:  data/raw/wikidata.json
Wyjście:  data/raw/commons.json, data/raw/plwiki.json  (działa przyrostowo)
"""
import json
import sys
import time
import urllib.parse
from pathlib import Path

from wm import chunks, get_json, strip_html

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "data" / "raw"
COMMONS_API = "https://commons.wikimedia.org/w/api.php"
PLWIKI_API = "https://pl.wikipedia.org/w/api.php"
THUMB_WIDTH = 1280  # jeden ze standardowych rozmiarów miniatur Wikimedia

# Licencje, które pozwalają na użycie zdjęcia w grze (z podaniem autorstwa)
OK_LICENSES = ("cc0", "public domain", "pd", "cc by", "cc-by", "cc by-sa", "cc-by-sa", "gfdl", "fal")


def load(path: Path) -> dict:
    return json.loads(path.read_text()) if path.exists() else {}


def fetch_commons(files: list[str], out: dict) -> None:
    todo = [f for f in files if f not in out]
    print(f"Commons: {len(todo)} plików do pobrania", file=sys.stderr)
    for batch in chunks(todo, 50):
        res = get_json(
            COMMONS_API,
            {
                "action": "query",
                "format": "json",
                "formatversion": 2,
                "prop": "imageinfo",
                "iiprop": "url|size|extmetadata",
                "iiurlwidth": THUMB_WIDTH,
                "iiextmetadatafilter": "Artist|LicenseShortName|LicenseUrl|AttributionRequired|DateTimeOriginal",
                "titles": "|".join("File:" + f for f in batch),
            },
        )
        norm = {n["to"]: n["from"] for n in res["query"].get("normalized", [])}
        for page in res["query"]["pages"]:
            title = page["title"]
            name = norm.get(title, title).removeprefix("File:").removeprefix("Plik:")
            ii = (page.get("imageinfo") or [None])[0]
            if not ii:
                out[name] = None
                continue
            md = ii.get("extmetadata", {})
            out[name] = {
                "thumb": ii.get("thumburl") or ii["url"],
                "width": ii.get("thumbwidth") or ii.get("width"),
                "height": ii.get("thumbheight") or ii.get("height"),
                "page": ii.get("descriptionurl"),
                "author": strip_html(md.get("Artist", {}).get("value", ""))[:200],
                "license": md.get("LicenseShortName", {}).get("value", ""),
                "licenseUrl": md.get("LicenseUrl", {}).get("value", ""),
                "photoDate": strip_html(md.get("DateTimeOriginal", {}).get("value", ""))[:40],
            }
        (RAW / "commons.json").write_text(json.dumps(out, ensure_ascii=False, indent=1))
        print(f"  {len(out)} gotowe", file=sys.stderr)
        time.sleep(1.5)


def fetch_plwiki(titles: list[str], out: dict) -> None:
    todo = [t for t in titles if t not in out]
    print(f"plwiki: {len(todo)} artykułów do pobrania", file=sys.stderr)
    for batch in chunks(todo, 20):  # limit API dla wstępów to 20
        res = get_json(
            PLWIKI_API,
            {
                "action": "query",
                "format": "json",
                "formatversion": 2,
                "prop": "extracts",
                "exintro": 1,
                "explaintext": 1,
                # exchars zamiast exsentences: API dzieli zdania na skrótach („ul.”, „św.”)
                "exchars": 700,
                "exlimit": 20,
                "redirects": 1,
                "titles": "|".join(batch),
            },
        )
        q = res["query"]
        back = {}
        for n in q.get("normalized", []) + q.get("redirects", []):
            back[n["to"]] = back.get(n["from"], n["from"])
        for page in q["pages"]:
            orig = back.get(page["title"], page["title"])
            out[orig] = (page.get("extract") or "").strip()
        for t in batch:
            out.setdefault(t, "")
        (RAW / "plwiki.json").write_text(json.dumps(out, ensure_ascii=False, indent=1))
        print(f"  {len(out)} gotowe", file=sys.stderr)
        time.sleep(1.5)


def main():
    items = json.loads((RAW / "wikidata.json").read_text())
    commons = load(RAW / "commons.json")
    fetch_commons(sorted({i["image"] for i in items}), commons)

    titles = sorted({urllib.parse.unquote(i["wiki"].rsplit("/wiki/", 1)[1]).replace("_", " ") for i in items})
    plwiki = load(RAW / "plwiki.json")
    fetch_plwiki(titles, plwiki)


if __name__ == "__main__":
    main()
