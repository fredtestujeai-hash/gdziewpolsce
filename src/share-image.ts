/**
 * Obrazek z wynikiem dnia do Instagrama (relacja 1080×1920 albo kwadrat 1080×1080), rysowany w przeglądarce na canvasie.
 * Kafelki są rysowane (nie emoji, które na canvasie wyglądają różnie w każdym systemie).
 * Na obrazku NIE MA nazw miejsc ani odpowiedzi — nie psuje gry innym.
 */
import { EN, LOCALE, tr } from "./i18n";
import { CONFIG } from "./config";
import { OUTLINE } from "./outline";
import { formatPoints, locLevel, rating, totalPoints, yearLevel, type TileLevel } from "./score";
import type { Guess } from "./types";

export type ImageFormat = "story" | "square";

export interface ShareImageData {
  number: number;
  /** Dzień wyzwania, RRRR-MM-DD. */
  dayKey: string;
  guesses: Guess[];
  rounds: number;
}

const C = {
  bg: "#f5efe4",
  surface: "#fffcf6",
  ink: "#1e1b17",
  muted: "#6d665c",
  line: "#e2d8c6",
  accent: "#c41e3a",
  tiles: { 0: "#2f9e5b", 1: "#e3ad12", 2: "#e8772e", 3: "#d2553f", x: "#3b3631" } as Record<string, string>,
};
const DISPLAY = '"Fraunces Variable", Georgia, "Times New Roman", serif';
const SANS = '"Inter Variable", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
const PIN = "M16 1C8 1 1.5 7.4 1.5 15.3c0 10.6 12.6 25.4 13.4 26.4a1.4 1.4 0 0 0 2.2 0c.8-1 13.4-15.8 13.4-26.4C30.5 7.4 24 1 16 1z";

/** „15 listopada 2026” */
export function formatDayWithYear(key: string): string {
  return new Intl.DateTimeFormat(LOCALE, { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(key + "T12:00:00Z"));
}

/** Czcionki gry muszą być wczytane, zanim canvas ich użyje (inaczej narysuje zastępcze). */
export async function loadImageFonts(): Promise<void> {
  if (!document.fonts?.load) return;
  const sample = "Gdzie w Polsce? Where in Poland? ąćęłńóśźż 0123456789";
  await Promise.all([
    document.fonts.load(`700 80px "Fraunces Variable"`, sample),
    document.fonts.load(`600 40px "Inter Variable"`, sample),
    document.fonts.load(`400 40px "Inter Variable"`, sample),
  ]).catch(() => undefined);
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  if (typeof ctx.roundRect === "function") return ctx.roundRect(x, y, w, h, r);
  // starsze przeglądarki (Safari < 16)
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Pinezka (ten sam kształt co logo gry); (x, y) to czubek, h to wysokość. */
function drawPin(ctx: CanvasRenderingContext2D, x: number, y: number, h: number, color: string, hole = C.surface): void {
  const k = h / 44;
  ctx.save();
  ctx.translate(x - 16 * k, y - 43 * k);
  ctx.scale(k, k);
  ctx.fillStyle = color;
  ctx.fill(new Path2D(PIN));
  ctx.beginPath();
  ctx.arc(16, 15, 5.5, 0, Math.PI * 2);
  ctx.fillStyle = hole;
  ctx.fill();
  ctx.restore();
}

/** Ikona kalendarza (wiersz kafelków za rok); (x, y) to lewy górny róg kwadratu s×s. */
function drawCalendar(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, color: string): void {
  const w = s * 0.86;
  const ox = x + (s - w) / 2;
  const oy = y + s * 0.12;
  const h = s * 0.8;
  ctx.save();
  ctx.lineWidth = s * 0.09;
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  roundRect(ctx, ox, oy, w, h, s * 0.12);
  ctx.stroke();
  ctx.fillRect(ox, oy, w, h * 0.27);
  ctx.lineCap = "round";
  for (const fx of [0.28, 0.72]) {
    ctx.beginPath();
    ctx.moveTo(ox + w * fx, y);
    ctx.lineTo(ox + w * fx, oy + h * 0.12);
    ctx.stroke();
  }
  const dot = s * 0.1;
  for (let r = 0; r < 2; r++) for (let c = 0; c < 3; c++) ctx.fillRect(ox + w * (0.2 + c * 0.25), oy + h * (0.45 + r * 0.26), dot, dot);
  ctx.restore();
}

/** Obrys Polski z pinezką, wpisany w prostokąt o szerokości w (wyśrodkowany w cx), górą w y. */
function drawOutline(ctx: CanvasRenderingContext2D, cx: number, y: number, w: number, opts: { alpha?: number; pin?: boolean } = {}): number {
  const k = w / OUTLINE.width;
  const h = OUTLINE.height * k;
  ctx.save();
  ctx.globalAlpha = opts.alpha ?? 1;
  ctx.translate(cx - w / 2, y);
  ctx.scale(k, k);
  const path = new Path2D(OUTLINE.d);
  ctx.fillStyle = C.surface;
  ctx.fill(path);
  ctx.lineJoin = "round";
  ctx.lineWidth = 5;
  ctx.strokeStyle = C.accent;
  ctx.stroke(path);
  ctx.restore();
  if (opts.pin !== false) {
    const [px, py] = OUTLINE.pin;
    const tipX = cx - w / 2 + px * k;
    const tipY = y + py * k;
    ctx.save();
    ctx.globalAlpha = 0.25;
    ctx.fillStyle = C.accent;
    ctx.beginPath();
    ctx.ellipse(tipX, tipY, 26 * k * 1.6, 11 * k * 1.6, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    drawPin(ctx, tipX, tipY + 2, 64 * k * 1.6, C.accent);
  }
  return h;
}

function text(ctx: CanvasRenderingContext2D, s: string, x: number, y: number, font: string, color: string, align: CanvasTextAlign = "center"): number {
  ctx.font = font;
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.textBaseline = "alphabetic";
  ctx.fillText(s, x, y);
  return ctx.measureText(s).width;
}

/** Tytuł gry z pinezką przed nazwą, wyśrodkowany. */
function drawTitle(ctx: CanvasRenderingContext2D, cx: number, y: number, size: number): void {
  ctx.font = `700 ${size}px ${DISPLAY}`;
  const tw = ctx.measureText(CONFIG.name).width;
  const pinH = size * 0.95;
  const gap = size * 0.25;
  const pinW = pinH * (32 / 44);
  const left = cx - (tw + gap + pinW) / 2;
  drawPin(ctx, left + pinW / 2, y + size * 0.06, pinH, C.accent, C.bg);
  text(ctx, CONFIG.name, left + pinW + gap, y, ctx.font, C.ink, "left");
}

/** Dwa wiersze kafelków (miejsce, rok); zwraca wysokość bloku. */
function drawTiles(ctx: CanvasRenderingContext2D, cx: number, y: number, guesses: Guess[], rounds: number, maxW: number): number {
  const rows: [string, TileLevel[]][] = [
    ["loc", guesses.map(locLevel)],
    ["year", guesses.map(yearLevel)],
  ];
  const n = Math.max(rounds, 1);
  const icon = 0.8;
  const gap = 0.16;
  // szerokość: ikona + odstęp + n kafelków
  const s = Math.min(118, maxW / (icon + 0.45 + n + (n - 1) * gap));
  const rowW = s * (icon + 0.45 + n + (n - 1) * gap);
  const x0 = cx - rowW / 2;
  rows.forEach(([kind, levels], r) => {
    const ry = y + r * s * (1 + gap * 1.6);
    const iy = ry + s * (1 - icon) / 2;
    if (kind === "loc") drawPin(ctx, x0 + (s * icon) / 2, iy + s * icon, s * icon, C.accent, C.bg);
    else drawCalendar(ctx, x0, iy, s * icon, C.ink);
    for (let i = 0; i < n; i++) {
      const tx = x0 + s * (icon + 0.45) + i * s * (1 + gap);
      const level = levels[i];
      roundRect(ctx, tx, ry, s, s, s * 0.18);
      if (level === undefined) {
        ctx.lineWidth = 4;
        ctx.strokeStyle = C.line;
        ctx.stroke();
      } else {
        ctx.fillStyle = C.tiles[String(level)];
        ctx.fill();
      }
    }
  });
  return s * (2 + gap * 1.6);
}

/** Notka pod kafelkami: podpowiedzi i rundy bez odpowiedzi. */
function notes(guesses: Guess[]): string {
  const hints = guesses.reduce((s, g) => s + (g.hintLoc ? 1 : 0) + (g.hintYear ? 1 : 0), 0);
  const skipped = guesses.filter((g) => g.gaveUp).length;
  return [hints ? `${hints} ${EN ? (hints === 1 ? "hint" : "hints") : hints === 1 ? "podpowiedź" : "podpowiedzi"}` : "", skipped ? `${skipped} ${tr("bez odpowiedzi", "unanswered")}` : ""].filter(Boolean).join(" · ");
}

/** Wynik: duża liczba i „/ maks.”, wyśrodkowane razem; y to linia bazowa. */
function drawScore(ctx: CanvasRenderingContext2D, cx: number, y: number, total: number, max: number, size: number): void {
  const big = `700 ${size}px ${DISPLAY}`;
  const small = `600 ${Math.round(size * 0.32)}px ${SANS}`;
  ctx.font = big;
  const a = formatPoints(total);
  const aw = ctx.measureText(a).width;
  ctx.font = small;
  const b = `/ ${formatPoints(max)}`;
  const bw = ctx.measureText(b).width;
  const gap = size * 0.12;
  const left = cx - (aw + gap + bw) / 2;
  text(ctx, a, left, y, big, C.ink, "left");
  text(ctx, b, left + aw + gap, y, small, C.muted, "left");
}

function drawUrlPill(ctx: CanvasRenderingContext2D, cx: number, y: number, size: number): void {
  const label = tr("Zagraj: gdziewpolsce.com", "Play: gdziewpolsce.com/en");
  ctx.font = `700 ${size}px ${SANS}`;
  const w = ctx.measureText(label).width + size * 1.6;
  const h = size * 2;
  roundRect(ctx, cx - w / 2, y, w, h, h / 2);
  ctx.fillStyle = C.accent;
  ctx.fill();
  ctx.textBaseline = "middle";
  ctx.textAlign = "center";
  ctx.fillStyle = "#ffffff";
  ctx.fillText(label, cx, y + h / 2 + size * 0.04);
}

/** Rysuje obrazek z wynikiem na nowym canvasie. */
export function renderShareImage(data: ShareImageData, format: ImageFormat): HTMLCanvasElement {
  const W = 1080;
  const H = format === "story" ? 1920 : 1080;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d")!;
  const cx = W / 2;
  const total = totalPoints(data.guesses);
  const max = data.rounds * (CONFIG.maxLocationPoints + CONFIG.maxYearPoints);
  const sub = `${tr("Wyzwanie", "Challenge")} #${data.number} · ${formatDayWithYear(data.dayKey)}`;
  const note = notes(data.guesses);

  ctx.fillStyle = C.bg;
  ctx.fillRect(0, 0, W, H);

  if (format === "story") {
    drawTitle(ctx, cx, 250, 92);
    text(ctx, sub, cx, 340, `500 42px ${SANS}`, C.muted);
    drawOutline(ctx, cx, 430, 700);
    // karta z wynikiem
    const top = 1080;
    roundRect(ctx, 90, top, W - 180, 650, 44);
    ctx.fillStyle = C.surface;
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = C.line;
    ctx.stroke();
    drawScore(ctx, cx, top + 200, total, max, 170);
    text(ctx, rating(total, max), cx, top + 285, `600 46px ${SANS}`, C.accent);
    drawTiles(ctx, cx, top + 335, data.guesses, data.rounds, W - 300);
    if (note) text(ctx, note, cx, top + 610, `500 34px ${SANS}`, C.muted);
    drawUrlPill(ctx, cx, 1780, 44);
  } else {
    drawOutline(ctx, cx, 150, 860, { alpha: 0.2, pin: false });
    drawTitle(ctx, cx, 130, 70);
    text(ctx, sub, cx, 200, `500 36px ${SANS}`, C.muted);
    drawScore(ctx, cx, 420, total, max, 170);
    text(ctx, rating(total, max), cx, 500, `600 42px ${SANS}`, C.accent);
    drawTiles(ctx, cx, 560, data.guesses, data.rounds, W - 260);
    if (note) text(ctx, note, cx, 860, `500 32px ${SANS}`, C.muted);
    drawUrlPill(ctx, cx, 905, 38);
  }
  return canvas;
}

/** Obrazek jako plik PNG. */
export function shareImageBlob(data: ShareImageData, format: ImageFormat): Promise<Blob> {
  const canvas = renderShareImage(data, format);
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("toBlob"))), "image/png"));
}
