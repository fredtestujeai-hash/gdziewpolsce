#!/usr/bin/env python3
"""Krok 4: układa harmonogram wyzwań dnia (6 zagadek na dzień).

Harmonogram jest *dopisywany* — dni już ułożone (w tym przeszłe) nie zmieniają się,
więc odświeżenie puli danych nigdy nie podmieni graczom dzisiejszego wyzwania.
Po zmianie reguł: `--rebuild-from RRRR-MM-DD` zostawia dni wcześniejsze bez zmian
(np. rozegrane wyzwania z 3 zagadkami), a od tej daty układa harmonogram od nowa.
`--rebuild` układa cały plik od nowa (tylko przed premierą).

Zasady doboru na dzień:
  * 2 łatwe, 2 średnie, 2 trudne (wg rozpoznawalności), w tej kolejności
  * najpierw zagadki jeszcze nie grane, potem najrzadziej grane (powtórki są dozwolone)
  * maks. 2 z tej samej kategorii i 2 z tego samego stulecia, każda z innego województwa
  * zagadki w promieniu 15 km od siebie nie trafiają na ten sam dzień
  (gdy żadna zagadka nie spełnia warunków różnorodności, są one luzowane)

Wyjście: public/data/schedule.json  {"start": "YYYY-MM-DD", "days": [[id × 6], ...]}
"""
import argparse
import json
import math
import random
import sys
from collections import Counter
from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
POOL = ROOT / "public" / "data" / "puzzles.json"
OUT = ROOT / "public" / "data" / "schedule.json"
def today_pl() -> date:
    """Dzisiejsza data w Polsce (wyzwanie zmienia się o północy czasu polskiego, nie UTC)."""
    return datetime.now(ZoneInfo("Europe/Warsaw")).date()


LAYOUT = [1, 1, 2, 2, 3, 3]  # poziomy trudności kolejnych rund (jak difficultyLayout w src/daily.ts)


def km(a, b):
    p1, p2 = math.radians(a["lat"]), math.radians(b["lat"])
    dp, dl = p2 - p1, math.radians(b["lon"] - a["lon"])
    h = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 12742 * math.asin(math.sqrt(h))


def fits(p, chosen):
    if sum(c["category"] == p["category"] for c in chosen) >= 2:
        return False
    if sum(c["year"] // 100 == p["year"] // 100 for c in chosen) >= 2:
        return False
    for c in chosen:
        if p.get("woj") and p.get("woj") == c.get("woj"):
            return False
        if p["place"] and p["place"] == c["place"]:
            return False
        if km(p, c) < 15:
            return False
    return True


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--start", default=None, help="data wyzwania #1 (domyślnie: dziś lub z istniejącego pliku)")
    ap.add_argument("--days", type=int, default=120, help="ile dni zaplanować naprzód od dziś")
    ap.add_argument("--seed", default="gdziewpolsce")
    ap.add_argument("--rebuild", action="store_true", help="ułóż cały harmonogram od nowa (zachowuje datę startu)")
    ap.add_argument("--rebuild-from", default=None, help="zostaw dni przed tą datą (RRRR-MM-DD), resztę ułóż od nowa")
    args = ap.parse_args()

    pool = {p["id"]: p for p in json.loads(POOL.read_text())["puzzles"]}
    sched = json.loads(OUT.read_text()) if OUT.exists() else {"start": args.start or today_pl().isoformat(), "days": []}
    if args.start:
        sched["start"] = args.start
    if args.rebuild:
        sched["days"] = []
    start = date.fromisoformat(sched["start"])
    if args.rebuild_from:
        keep = (date.fromisoformat(args.rebuild_from) - start).days
        if keep <= (today_pl() - start).days:
            sys.exit("--rebuild-from musi wskazywać dzień po dzisiejszym — nie zmieniamy wyzwań już rozgrywanych")
        sched["days"] = sched["days"][:keep]
    today_idx = (today_pl() - start).days

    # Dni od dziś wzwyż, w których zniknęła jakaś zagadka (usunięta z puli), układamy od nowa
    for i in range(max(0, today_idx), len(sched["days"])):
        if any(q not in pool for q in sched["days"][i]):
            sched["days"] = sched["days"][:i]
            print(f"Dzień {i + 1}: brak zagadki w puli — przeplanowuję od tego dnia", file=sys.stderr)
            break

    used = Counter(q for day in sched["days"] for q in day)
    target = max(today_idx, 0) + args.days
    by_tier = {t: sorted(q for q, p in pool.items() if p["difficulty"] == t) for t in (1, 2, 3)}

    while len(sched["days"]) < target:
        n = len(sched["days"])
        rng = random.Random(f"{args.seed}:{n}")
        chosen = []
        for tier in LAYOUT:
            cands = by_tier[tier][:]
            rng.shuffle(cands)
            # najpierw najrzadziej używane (0 = jeszcze nie grane), potem warunki różnorodności
            cands.sort(key=lambda q: used[q])
            pick = next((q for q in cands if q not in [c["id"] for c in chosen] and fits(pool[q], chosen)), None)
            if pick is None:  # poluzuj warunki zamiast się zatrzymać
                pick = next(q for q in cands if q not in [c["id"] for c in chosen])
            chosen.append(pool[pick])
            used[pick] += 1
        sched["days"].append([c["id"] for c in chosen])

    OUT.write_text(json.dumps(sched, separators=(",", ":")))
    fresh = {t: sum(1 for q in by_tier[t] if used[q] == 0) for t in by_tier}
    repeats = sum(1 for q, c in used.items() if c > 1)
    print(
        f"Harmonogram: {len(sched['days'])} dni od {sched['start']} "
        f"(do {start + timedelta(days=len(sched['days']) - 1)}); "
        f"niewykorzystane wg trudności: {fresh}; zagadek powtórzonych: {repeats}",
        file=sys.stderr,
    )


if __name__ == "__main__":
    main()
