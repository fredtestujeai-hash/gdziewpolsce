"""Wspólne narzędzia do uprzejmego odpytywania API Wikimedia."""
import json
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from html import unescape

UA = "PinezkaDataBuilder/0.1 (open-source educational game; data build script)"


def get_json(url: str, params: dict, retries: int = 8) -> dict:
    full = url + "?" + urllib.parse.urlencode(params)
    for attempt in range(retries):
        req = urllib.request.Request(full, headers={"User-Agent": UA})
        try:
            with urllib.request.urlopen(req, timeout=60) as r:
                return json.load(r)
        except urllib.error.HTTPError as e:
            wait = int(e.headers.get("Retry-After") or 0) or 5 * 2**attempt
            print(f"  ! HTTP {e.code} — czekam {wait}s", file=sys.stderr)
            time.sleep(min(wait, 120))
        except Exception as e:  # noqa: BLE001
            wait = 5 * 2**attempt
            print(f"  ! {e} — czekam {wait}s", file=sys.stderr)
            time.sleep(min(wait, 120))
    raise RuntimeError(f"Nie udało się pobrać {url}")


def strip_html(s: str) -> str:
    s = re.sub(r"<[^>]+>", "", s or "")
    return re.sub(r"\s+", " ", unescape(s)).strip()


def chunks(seq, n):
    for i in range(0, len(seq), n):
        yield seq[i : i + n]
