import { CONFIG } from "./config";
import type { Campaign, Puzzle, Schedule } from "./types";

/** Dzisiejsza data w Polsce jako RRRR-MM-DD (wyzwanie zmienia się o północy czasu polskiego). */
export function todayKey(now: Date = new Date(), tz = CONFIG.timezone): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

/** Liczba dni między dwiema datami RRRR-MM-DD (b - a). */
export function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(b + "T00:00:00Z") - Date.parse(a + "T00:00:00Z")) / 86_400_000);
}

export function addDays(key: string, n: number): string {
  return new Date(Date.parse(key + "T00:00:00Z") + n * 86_400_000).toISOString().slice(0, 10);
}

/** Milisekundy do najbliższej północy czasu polskiego. */
export function msUntilNextChallenge(now: Date = new Date(), tz = CONFIG.timezone): number {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: tz,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  const elapsed = (get("hour") * 3600 + get("minute") * 60 + get("second")) * 1000 + now.getMilliseconds();
  return 86_400_000 - elapsed;
}

/** Deterministyczny generator liczb losowych (mulberry32). */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** Awaryjny dobór, gdy harmonogram się skończył: losowo, ale tak samo dla wszystkich graczy. */
export function fallbackIds(pool: Puzzle[], key: string, n = CONFIG.rounds): string[] {
  const rand = rng(hash("fallback:" + key));
  const tiers: Record<number, Puzzle[]> = { 1: [], 2: [], 3: [] };
  for (const p of [...pool].sort((a, b) => a.id.localeCompare(b.id))) tiers[p.difficulty].push(p);
  const layout = [1, 2, 1, 2, 2, 3, 2, 3, 3, 3].slice(0, n);
  const out: string[] = [];
  for (const t of layout) {
    const list = tiers[t].filter((p) => !out.includes(p.id));
    if (list.length) out.push(list[Math.floor(rand() * list.length)].id);
  }
  return out;
}

export function activeCampaign(campaigns: Campaign[], key: string, demo: boolean): Campaign | undefined {
  const active = campaigns.filter((c) => c.from <= key && key <= c.to && (!c.demo || demo) && c.puzzles.length);
  if (!active.length) return undefined;
  // Kilka kampanii naraz: rotacja dzienna, maks. jedna zagadka sponsorowana na dzień
  return active[hash(key) % active.length];
}

/** Slot, w którym pojawia się zagadka sponsorowana (środek wyzwania). */
export const SPONSOR_SLOT = 4;

export interface Challenge {
  key: string;
  number: number;
  puzzles: Puzzle[];
}

/**
 * Składa wyzwanie dnia: harmonogram (albo awaryjny dobór) + ewentualna zagadka sponsorowana.
 * `savedIds` — jeśli gracz zaczął już dzisiejsze wyzwanie, trzymamy się zapisanej listy.
 */
export function buildChallenge(
  pool: Puzzle[],
  schedule: Schedule,
  campaigns: Campaign[],
  key: string,
  opts: { demo?: boolean; savedIds?: string[] } = {},
): Challenge {
  const byId = new Map(pool.map((p) => [p.id, p]));
  const sponsored = new Map<string, Puzzle>();
  const campaign = activeCampaign(campaigns, key, !!opts.demo);
  for (const c of campaigns) for (const p of c.puzzles) sponsored.set(p.id, { ...p, sponsor: c.sponsor, campaign: c.id });

  const index = daysBetween(schedule.start, key);
  const number = index + 1;

  let ids: string[];
  if (opts.savedIds?.length && opts.savedIds.every((id) => byId.has(id) || sponsored.has(id))) {
    ids = opts.savedIds;
  } else {
    ids = index >= 0 && index < schedule.days.length ? [...schedule.days[index]] : fallbackIds(pool, key);
    ids = ids.filter((id) => byId.has(id));
    if (campaign) {
      const sp = campaign.puzzles[Math.abs(index) % campaign.puzzles.length];
      ids = ids.filter((id) => id !== sp.id);
      ids.splice(Math.min(SPONSOR_SLOT, ids.length), ids.length >= CONFIG.rounds ? 1 : 0, sp.id);
    }
  }
  const puzzles = ids.map((id) => sponsored.get(id) ?? byId.get(id)).filter((p): p is Puzzle => !!p);
  return { key, number, puzzles };
}
