// THE WORLD IN ONE DAY — Wednesday 18 November 2026.
// A from-scratch software renderer (Node 22, standard library only) that draws
// a one-page broadsheet of the day's verified world news and encodes it as PNG.
// No network, no assets, no fonts: a hand-built 5x7 bitmap typeface, vector
// scene illustrations, and a deterministic PNG encoder (node:zlib).
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { deflateSync } from 'node:zlib';

const W = 1024, H = 1024;
const buf = new Uint8ClampedArray(W * H * 3);

// ---- palette ----
const PAPER = [247, 243, 232], INK = [17, 17, 17], RED = [178, 34, 28];
const BLUE = [27, 68, 128], TEAL = [14, 110, 110], GOLD = [186, 140, 28];
const GREY = [90, 86, 78], LIGHT = [232, 226, 210], DARKBLUE = [16, 42, 80];
const SKY = [178, 210, 232], SEA = [38, 110, 150], SAND = [226, 200, 150];

function px(x: number, y: number, c: number[]) {
  if (x < 0 || y < 0 || x >= W || y >= H) return;
  const i = (y * W + x) * 3; buf[i] = c[0]; buf[i + 1] = c[1]; buf[i + 2] = c[2];
}
function fill(x: number, y: number, w: number, h: number, c: number[]) {
  x = Math.max(0, Math.floor(x)); y = Math.max(0, Math.floor(y));
  w = Math.floor(w); h = Math.floor(h);
  for (let j = y; j < y + h && j < H; j++)
    for (let i = x; i < x + w && i < W; i++) px(i, j, c);
}
function rect(x: number, y: number, w: number, h: number, c: number[]) {
  fill(x, y, w, 1, c); fill(x, y + h - 1, w, 1, c);
  fill(x, y, 1, h, c); fill(x + w - 1, y, 1, h, c);
}
function line(x0: number, y0: number, x1: number, y1: number, c: number[]) {
  const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
  let e = dx + dy, x = x0, y = y0;
  for (;;) { px(x, y, c); if (x === x1 && y === y1) break; const e2 = 2 * e; if (e2 >= dy) { e += dy; x += sx; } if (e2 <= dx) { e += dx; y += sy; } }
}
function circle(cx: number, cy: number, r: number, c: number[]) {
  for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++)
    if (x * x + y * y <= r * r) px(cx + x, cy + y, c);
}
function disc(cx: number, cy: number, r: number, c: number[]) { circle(cx, cy, r, c); }
function ring(cx: number, cy: number, r: number, c: number[]) {
  for (let a = 0; a < 360; a += 2) {
    const t = a * Math.PI / 180;
    px(Math.round(cx + r * Math.cos(t)), Math.round(cy + r * Math.sin(t)), c);
  }
}
function tri(x0: number, y0: number, x1: number, y1: number, x2: number, y2: number, c: number[]) {
  const minX = Math.min(x0, x1, x2), maxX = Math.max(x0, x1, x2);
  const minY = Math.min(y0, y1, y2), maxY = Math.max(y0, y1, y2);
  const d = (x1 - x0) * (y2 - y0) - (y1 - y0) * (x2 - x0);
  for (let y = minY; y <= maxY; y++) for (let x = minX; x <= maxX; x++) {
    const a = ((x1 - x) * (y2 - y) - (y1 - y) * (x2 - x)) / d;
    const b = ((x2 - x) * (y0 - y) - (y2 - y) * (x0 - x)) / d;
    const g = 1 - a - b;
    if (a >= 0 && b >= 0 && g >= 0) px(x, y, c);
  }
}
function burst(cx: number, cy: number, r: number, c: number[]) {
  for (let k = 0; k < 12; k++) {
    const a = k * Math.PI / 6;
    line(cx, cy, Math.round(cx + r * Math.cos(a)), Math.round(cy + r * Math.sin(a)), c);
    line(cx, cy, Math.round(cx + r * 0.6 * Math.cos(a + 0.26)), Math.round(cy + r * 0.6 * Math.sin(a + 0.26)), c);
  }
  disc(cx, cy, Math.max(3, r / 4), c);
}

// ---- 5x7 bitmap typeface (all text rendered in capitals, broadsheet style) ----
const F: Record<string, number[]> = {
  A: [14, 17, 17, 31, 17, 17, 17], B: [30, 17, 17, 30, 17, 17, 30],
  C: [14, 17, 16, 16, 16, 17, 14], D: [30, 17, 17, 17, 17, 17, 30],
  E: [31, 16, 16, 30, 16, 16, 31], F: [31, 16, 16, 30, 16, 16, 16],
  G: [14, 17, 16, 23, 17, 17, 15], H: [17, 17, 17, 31, 17, 17, 17],
  I: [14, 4, 4, 4, 4, 4, 14], J: [7, 2, 2, 2, 2, 18, 12],
  K: [17, 18, 20, 24, 20, 18, 17], L: [16, 16, 16, 16, 16, 16, 31],
  M: [17, 27, 21, 21, 17, 17, 17], N: [17, 25, 21, 19, 17, 17, 17],
  O: [14, 17, 17, 17, 17, 17, 14], P: [30, 17, 17, 30, 16, 16, 16],
  Q: [14, 17, 17, 17, 21, 18, 13], R: [30, 17, 17, 30, 20, 18, 17],
  S: [15, 16, 16, 14, 1, 1, 30], T: [31, 4, 4, 4, 4, 4, 4],
  U: [17, 17, 17, 17, 17, 17, 14], V: [17, 17, 17, 17, 17, 10, 4],
  W: [17, 17, 17, 21, 21, 21, 10], X: [17, 17, 10, 4, 10, 17, 17],
  Y: [17, 17, 10, 4, 4, 4, 4], Z: [31, 1, 2, 4, 8, 16, 31],
  '0': [14, 17, 19, 21, 25, 17, 14], '1': [4, 12, 4, 4, 4, 4, 14],
  '2': [14, 17, 1, 6, 8, 16, 31], '3': [30, 1, 1, 14, 1, 1, 30],
  '4': [2, 6, 10, 18, 31, 2, 2], '5': [31, 16, 30, 1, 1, 17, 14],
  '6': [14, 16, 16, 30, 17, 17, 14], '7': [31, 1, 2, 4, 8, 8, 8],
  '8': [14, 17, 17, 14, 17, 17, 14], '9': [14, 17, 17, 15, 1, 1, 14],
  ' ': [0, 0, 0, 0, 0, 0, 0], '.': [0, 0, 0, 0, 0, 12, 12],
  ',': [0, 0, 0, 0, 12, 4, 8], ':': [0, 12, 12, 0, 12, 12, 0],
  ';': [0, 12, 12, 0, 12, 4, 8], "'": [4, 4, 8, 0, 0, 0, 0],
  '-': [0, 0, 0, 14, 0, 0, 0], '/': [1, 1, 2, 4, 8, 16, 16],
  '(': [2, 4, 8, 8, 8, 4, 2], ')': [8, 4, 2, 2, 2, 4, 8],
  '%': [24, 25, 2, 4, 8, 19, 3], '$': [4, 15, 20, 14, 5, 30, 4],
  '&': [12, 18, 20, 8, 21, 18, 13], '!': [4, 4, 4, 4, 4, 0, 4],
  '?': [14, 17, 1, 6, 4, 0, 4], '"': [10, 10, 0, 0, 0, 0, 0],
  '+': [0, 4, 4, 31, 4, 4, 0], '=': [0, 0, 31, 0, 31, 0, 0],
  '*': [0, 4, 21, 14, 21, 4, 0], '#': [10, 10, 31, 10, 31, 10, 10],
  '@': [14, 17, 23, 21, 23, 16, 14],
};
function glyph(ch: string): number[] {
  return F[ch] ?? F['?'];
}
function textW(s: string, sc: number): number {
  return s.length * 6 * sc - sc;
}
function drawText(x: number, y: number, s: string, sc: number, c: number[], bold = false) {
  s = s.toUpperCase().replace(/[—–]/g, '-').replace(/[’‘]/g, "'").replace(/•/g, '*');
  let cx = x;
  for (const ch of s) {
    const g = glyph(ch);
    for (let r = 0; r < 7; r++) for (let col = 0; col < 5; col++) {
      if ((g[r] >> (4 - col)) & 1) {
        fill(cx + col * sc, y + r * sc, sc, sc, c);
        if (bold) fill(cx + col * sc + 1, y + r * sc, sc, sc, c);
      }
    }
    cx += 6 * sc;
  }
  return cx;
}
function wrap(s: string, maxW: number, sc: number): string[] {
  const words = s.split(' ');
  const lines: string[] = []; let cur = '';
  for (const w of words) {
    const t = cur ? cur + ' ' + w : w;
    if (textW(t, sc) <= maxW) cur = t;
    else { if (cur) lines.push(cur); cur = w; }
  }
  if (cur) lines.push(cur);
  return lines;
}
function para(x: number, y: number, s: string, maxW: number, sc: number, c: number[], lh: number, bold = false): number {
  const lines = wrap(s, maxW, sc);
  for (const ln of lines) { drawText(x, y, ln, sc, c, bold); y += lh; }
  return y;
}
function center(s: string, y: number, sc: number, c: number[], bold = false) {
  drawText(Math.round((W - textW(s, sc)) / 2), y, s, sc, c, bold);
}

// ---- background ----
fill(0, 0, W, H, PAPER);
fill(0, 0, W, 6, RED);

// ---- masthead ----
center('THE WORLD IN ONE DAY', 22, 6, INK, true);
center('WEDNESDAY, 18 NOVEMBER 2026', 76, 2, RED, true);
fill(24, 104, W - 48, 3, INK);
fill(24, 110, W - 48, 1, INK);

// ---- scene illustrations (flat vector drawings) ----
function sceneApec(x: number, y: number, w: number, h: number) {
  fill(x, y, w, h, SKY);
  fill(x, y + h - 34, w, 34, [120, 130, 140]);
  // Shenzhen towers
  fill(x + 14, y + 30, 22, h - 30, [70, 80, 95]); fill(x + 44, y + 14, 18, h - 14, [90, 100, 118]);
  fill(x + w - 66, y + 22, 20, h - 22, [70, 80, 95]); fill(x + w - 40, y + 40, 24, h - 40, [90, 100, 118]);
  for (let i = 0; i < 5; i++) { fill(x + 48 + i * 6, y + 20 + i * 3, 3, 3, GOLD); }
  // red carpet
  fill(x, y + h - 18, w, 18, RED);
  // three leaders: three figures
  const cols = [DARKBLUE, RED, [60, 60, 60]];
  for (let k = 0; k < 3; k++) {
    const cx = x + w / 2 - 52 + k * 52;
    disc(cx, y + h - 62, 11, [232, 196, 160]); // head
    fill(cx - 13, y + h - 50, 26, 32, cols[k]); // suit
    fill(cx - 3, y + h - 50, 6, 30, [255, 255, 255]); // shirt
  }
  disc(x + w - 30, y + 26, 16, GOLD); // sun
}
function sceneGulf(x: number, y: number, w: number, h: number) {
  fill(x, y, w, h, [214, 176, 130]); // dusk sky
  fill(x, y + h - 46, w, 46, SEA);
  // Qeshm island
  fill(x + 18, y + h - 58, 150, 14, [120, 100, 70]);
  tri(x + 30, y + h - 58, x + 60, y + h - 84, x + 90, y + h - 58, [100, 84, 58]);
  // missile site + explosion
  fill(x + 96, y + h - 84, 6, 26, INK);
  burst(x + 99, y + h - 92, 22, [255, 190, 40]);
  disc(x + 99, y + h - 92, 8, RED);
  // jet
  const jx = x + w - 110, jy = y + 30;
  tri(jx, jy, jx + 46, jy + 8, jx, jy + 16, [40, 40, 46]);
  tri(jx + 10, jy + 8, jx + 22, jy - 8, jx + 26, jy + 8, [40, 40, 46]);
  line(jx + 46, jy + 8, jx + 66, jy + 8, [200, 200, 200]);
  // tanker + smoke
  fill(x + w - 130, y + h - 40, 96, 12, [60, 60, 66]);
  fill(x + w - 104, y + h - 52, 14, 12, [60, 60, 66]);
  disc(x + w - 84, y + h - 60, 7, [90, 90, 96]); disc(x + w - 72, y + h - 68, 9, [120, 120, 126]);
  fill(x + 20, y + h - 30, 90, 3, [255, 255, 255]);
}
function sceneKerch(x: number, y: number, w: number, h: number) {
  fill(x, y, w, h, [190, 205, 220]);
  fill(x, y + h - 40, w, 40, [52, 96, 138]);
  // bridge deck, broken in the middle
  fill(x + 8, y + 52, 120, 10, [70, 70, 78]); fill(x + w - 128, y + 52, 120, 10, [70, 70, 78]);
  // fallen arch span in the water, tilted
  line(x + w / 2 - 58, y + 66, x + w / 2 + 40, y + h - 14, [120, 30, 26]);
  line(x + w / 2 - 58, y + 76, x + w / 2 + 40, y + h - 4, [120, 30, 26]);
  for (let i = 0; i < 4; i++) line(x + w / 2 - 48 + i * 24, y + 68 + i * 6, x + w / 2 - 40 + i * 24, y + h - 12 + i * 2, [120, 30, 26]);
  // standing arch
  for (let a = 0; a <= 180; a += 4) {
    const t = a * Math.PI / 180;
    const ax = Math.round(x + 40 + 44 * Math.cos(Math.PI - t));
    const ay = Math.round(y + 52 - 34 * Math.sin(t));
    px(ax, ay, RED); px(ax, ay + 1, RED); px(ax + 1, ay, RED);
  }
  // pylons
  fill(x + 30, y + 18, 8, 44, [70, 70, 78]); fill(x + w - 38, y + 18, 8, 44, [70, 70, 78]);
  // smoke + waves
  disc(x + w / 2, y + 34, 10, [120, 120, 126]); disc(x + w / 2 + 16, y + 28, 12, [150, 150, 156]);
  for (let i = 0; i < 5; i++) fill(x + 16 + i * 56, y + h - 22, 34, 3, [255, 255, 255]);
}
function scenePeltola(x: number, y: number, w: number, h: number) {
  fill(x, y, w, h, [214, 226, 240]);
  // ballot box
  fill(x + 26, y + 46, 92, 52, BLUE);
  fill(x + 18, y + 34, 108, 14, DARKBLUE);
  fill(x + 58, y + 26, 28, 10, [255, 255, 255]);
  // ballot going in
  fill(x + 56, y + 8, 32, 20, [255, 255, 255]); rect(x + 56, y + 8, 32, 20, INK);
  drawText(x + 62, y + 13, 'VOTE', 1, RED, true);
  // big 56-44
  drawText(x + 150, y + 30, '56', 4, BLUE, true);
  drawText(x + 150, y + 66, '44', 4, RED, true);
  drawText(x + 226, y + 44, 'SENATE', 1, INK, true);
}
function sceneEbola(x: number, y: number, w: number, h: number) {
  fill(x, y, w, h, [238, 226, 208]);
  // stylised Congo map blob
  fill(x + 30, y + 16, 70, 26, [120, 150, 110]); fill(x + 22, y + 38, 86, 30, [120, 150, 110]);
  fill(x + 40, y + 64, 60, 22, [120, 150, 110]);
  // red case dots spreading
  const dots: [number, number][] = [[52, 28], [72, 44], [58, 58], [88, 30], [44, 48], [96, 56], [66, 70]];
  for (const [dx, dy] of dots) disc(x + dx, y + dy, 6, RED);
  drawText(x + 150, y + 26, '11,000+', 3, RED, true);
  drawText(x + 150, y + 56, 'CASES', 2, INK, true);
  drawText(x + 150, y + 78, '5,400 DEAD', 1, INK, true);
}
function sceneNvidia(x: number, y: number, w: number, h: number) {
  fill(x, y, w, h, [18, 24, 18]);
  // chip
  fill(x + 22, y + 30, 64, 64, [30, 60, 30]); rect(x + 22, y + 30, 64, 64, [118, 185, 0]);
  for (let i = 0; i < 5; i++) { fill(x + 14, y + 40 + i * 10, 8, 3, [118, 185, 0]); fill(x + 86, y + 40 + i * 10, 8, 3, [118, 185, 0]); }
  drawText(x + 36, y + 56, 'NV', 2, [118, 185, 0], true);
  // rising chart
  line(x + 110, y + 92, x + 150, y + 66, [118, 185, 0]); line(x + 150, y + 66, x + 180, y + 72, [118, 185, 0]);
  line(x + 180, y + 72, x + 220, y + 40, [118, 185, 0]); line(x + 220, y + 40, x + 268, y + 18, [118, 185, 0]);
  tri(x + 268, y + 18, x + 254, y + 18, x + 268, y + 32, [118, 185, 0]);
  drawText(x + 110, y + 12, '$115.8BN', 2, [255, 255, 255], true);
}

// ---- hero stories (3 large) ----
type Hero = { tag: string; color: number[]; scene: (x: number, y: number, w: number, h: number) => void; head: string; deck: string };
const heroes: Hero[] = [
  { tag: 'ASIA-PACIFIC / SHENZHEN', color: RED, scene: sceneApec,
    head: 'XI HUGS TRUMP AS THREE LEADERS MEET',
    deck: 'Xi greets Trump on the Shenzhen tarmac and Putin joins them at APEC. The first-ever Xi-Trump-Putin trilateral is set for Thursday, with Ukraine, Iran and nuclear arms on the table.' },
  { tag: 'MIDDLE EAST / GULF', color: RED, scene: sceneGulf,
    head: 'US JETS HIT QESHM AS IRAN STRIKES BACK',
    deck: 'US fighters strike an IRGC missile site on Qeshm Island after Iranian drones hit a US radar base in Bahrain. Iran then targets bases in Bahrain and Kuwait; a tanker is hit in Hormuz.' },
  { tag: 'EUROPE / KERCH STRAIT', color: BLUE, scene: sceneKerch,
    head: 'KERCH BRIDGE SPAN FALLS INTO THE SEA',
    deck: 'Ukraine hits the Crimea bridge a second night and a 227-metre road arch drops into the strait. Road traffic is cut; Russia answers with missiles on Kyiv bridges, killing two.' },
];
const HX = 24, HW = 312, HGAP = 16, HY = 122;
heroes.forEach((h, i) => {
  const x = HX + i * (HW + HGAP);
  h.scene(x, HY, HW, 108);
  rect(x, HY, HW, 108, INK);
  drawText(x, HY + 116, h.tag, 1, h.color, true);
  let y = para(x, HY + 132, h.head, HW, 2, INK, 18, true);
  para(x, y + 2, h.deck, HW, 1, [40, 38, 34], 11);
});
fill(24, 340, W - 48, 2, INK);

// ---- medium stories (3) ----
type Med = { tag: string; color: number[]; scene: (x: number, y: number, w: number, h: number) => void; head: string; deck: string };
const meds: Med[] = [
  { tag: 'USA / SENATE', color: BLUE, scene: scenePeltola,
    head: 'PELTOLA WINS ALASKA SENATE RACE',
    deck: 'Mary Peltola beats Dan Sullivan with 50.12% of first choices. Democrats take the Senate 56-44 in the ninth flip of the midterms.' },
  { tag: 'AFRICA / HEALTH', color: RED, scene: sceneEbola,
    head: 'EBOLA IN CONGO PASSES 11,000 CASES',
    deck: 'The outbreak has more than doubled in three months to 11,000 cases and 5,400 deaths, the UN says - already the second-largest Ebola outbreak on record.' },
  { tag: 'TECH / MARKETS', color: TEAL, scene: sceneNvidia,
    head: 'NVIDIA SALES DOUBLE TO $115.8BN',
    deck: 'Revenue rises 103% in its first quarter without founder Jensen Huang, with data centres at $107.6bn. The board rules out bringing Huang back as chief.' },
];
const MY = 352;
meds.forEach((m, i) => {
  const x = HX + i * (HW + HGAP);
  m.scene(x, MY, HW, 96);
  rect(x, MY, HW, 96, INK);
  drawText(x, MY + 104, m.tag, 1, m.color, true);
  let y = para(x, MY + 118, m.head, HW, 2, INK, 17, true);
  para(x, y + 1, m.deck, HW, 1, [40, 38, 34], 11);
});
fill(24, 540, W - 48, 2, INK);
drawText(24, 550, 'THE DAY IN BRIEF', 2, INK, true);
drawText(W - 24 - textW('20 MORE STORIES FROM EVERY REGION', 1), 554, '20 MORE STORIES FROM EVERY REGION', 1, GREY, true);

// ---- briefs: 20 stories in 3 columns ----
type Brief = { tag: string; color: number[]; head: string; fact: string };
const briefs: Brief[] = [
  { tag: 'SPACE', color: TEAL, head: 'VOYAGER 1 CROSSES ONE LIGHT-DAY', fact: 'NASA probe passes 16bn miles from Earth at 05:16 ET.' },
  { tag: 'OCEANIA', color: BLUE, head: 'CYCLONE XAVIER HITS CAT. 5', fact: 'Gusts of 315 km/h bear down on the Cook Islands.' },
  { tag: 'RUSSIA', color: RED, head: 'ARMY PLANE CRASH KILLS 19', fact: 'An-12 transport comes down near Kemerovo, Siberia.' },
  { tag: 'USA', color: RED, head: 'US LOSES MEASLES-FREE STATUS', fact: '5,412 cases in 2026, most since 1991; status held 26 years.' },
  { tag: 'MIDDLE EAST', color: RED, head: 'GAZA TRUCE FRAYS', fact: 'Israel launches broad ground push in central Gaza.' },
  { tag: 'CLIMATE', color: TEAL, head: 'COP31: 75 NATIONS BACK POWER GOAL', fact: 'Antalya talks back a global electrification target.' },
  { tag: 'MARKETS', color: GOLD, head: 'STOCKS SLIDE AS WAR JITTERS GROW', fact: 'Dow -1.6%, S&P -1.0%; Brent near $92; gold under $3,800.' },
  { tag: 'UK', color: BLUE, head: 'UK INFLATION HITS 3.6%', fact: 'A one-year high in October, driven by fuel prices.' },
  { tag: 'CRYPTO', color: GOLD, head: 'BITCOIN STUCK BELOW $65,000', fact: 'Trades near $64,600, close to three-month lows.' },
  { tag: 'TECH', color: TEAL, head: 'OPENAI LAUNCHES GPT-6.2', fact: 'New Astra and Sol models arrive with lower API prices.' },
  { tag: 'ASIA', color: BLUE, head: 'CYCLONE AKVAN NEARS INDIA', fact: 'Severe storm heads for the east coast; Odisha reports 11 dead.' },
  { tag: 'ASIA', color: BLUE, head: 'INDONESIA HIKES RATES TO 6%', fact: 'Rupiah defence as the currency hits a record low.' },
  { tag: 'ASIA', color: BLUE, head: 'TRUMP IN MANILA BEFORE APEC', fact: 'Quad leaders warn on coercion; US-Philippines trade deal.' },
  { tag: 'UKRAINE', color: BLUE, head: 'ODESA STRIKES KILL FOUR', fact: 'Russian air strikes hit the southern port city.' },
  { tag: 'EUROPE', color: BLUE, head: 'UK SANCTIONS OVER WEST BANK', fact: 'London targets firms linked to settlements.' },
  { tag: 'MIDDLE EAST', color: RED, head: 'HOUTHIS TARGET SAUDI PIPELINE', fact: 'Drone attacks reported on Saudi energy links.' },
  { tag: 'ASIA', color: BLUE, head: 'LEE ASKS XI FOR KOREA PEACE PUSH', fact: 'South Korea seeks joint efforts on the peninsula.' },
  { tag: 'JUSTICE', color: TEAL, head: 'WORLD COURT NEARS MYANMAR RULING', fact: 'Judges prepare to rule in the genocide case.' },
  { tag: 'TECH', color: TEAL, head: 'OUTAGES HIT BANKS AND FLIGHTS', fact: 'Systems failures disrupt services around the world.' },
  { tag: 'CULTURE', color: GOLD, head: "'HUMAN' IS WORD OF THE YEAR", fact: 'Cambridge Dictionary picks its word for 2026.' },
];
const BY = 576, BW = 312;
const cols: Brief[][] = [[], [], []];
briefs.forEach((b, i) => cols[i % 3].push(b));
cols.forEach((col, ci) => {
  const x = HX + ci * (BW + HGAP);
  let y = BY;
  col.forEach((b, bi) => {
    if (bi > 0) { fill(x, y - 6, BW, 1, LIGHT); }
    drawText(x, y, b.tag, 1, b.color, true);
    y = para(x, y + 12, b.head, BW, 1, INK, 11, true);
    y = para(x, y, b.fact, BW, 1, [60, 58, 52], 10);
    y += 8;
  });
});

// ---- footer ----
fill(24, 972, W - 48, 2, INK);
center('DOW -1.6%  *  S&P 500 -1.0%  *  BRENT $92  *  GOLD UNDER $3,800  *  BITCOIN $64,600', 984, 1, INK, true);
center('ALL EVENTS HAPPENED OR WERE FIRST REPORTED ON 18 NOVEMBER 2026  *  26 STORIES  *  7 REGIONS', 1002, 1, GREY);

// ---- PNG encode (deterministic) ----
const crcTable = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
  crcTable[n] = c >>> 0;
}
function crc32(b: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < b.length; i++) c = crcTable[(c ^ b[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type: string, data: Buffer): Buffer {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, 'ascii');
  data.copy(out, 8);
  out.writeUInt32BE(crc32(Buffer.concat([Buffer.from(type, 'ascii'), data])), 8 + data.length);
  return out;
}
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4);
ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
const raw = Buffer.alloc(H * (1 + W * 3));
for (let y = 0; y < H; y++) {
  raw[y * (1 + W * 3)] = 0;
  Buffer.from(buf.subarray(y * W * 3, (y + 1) * W * 3)).copy(raw, y * (1 + W * 3) + 1);
}
const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk('IHDR', ihdr),
  chunk('IDAT', deflateSync(raw, { level: 9 })),
  chunk('IEND', Buffer.alloc(0)),
]);
const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';
mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, 'entry.png'), png);
