// What Ferdowsi Let In: the Shahnameh with only its Arabic words left, and its deaths.
//
// The whole book is laid out as a manuscript of columns, read right to left, two half-lines to
// a row, and drawn dark. The Persian is there only as a ghost, close up. What shows is the
// Arabic: every word Ferdowsi took from Arabic, set where it falls on its line. A second layer
// marks the couplets where someone dies.

const GUTTER = 1.4;            // between the two halves of a couplet, in em
const COL_GAP = 4.5;           // between columns of the book
const MARGIN = 6;
const ASPECT = 1.45;           // the book is laid out to roughly this width over height
const MAX_PX_PER_EM = 110;     // closest zoom
const READ_PX_PER_EM = 7;      // from here on the Persian shows, faintly, and the couplets can be read
const WORD_PX_PER_EM = 3;      // from here on the Arabic words are written out, not marked
const THEME_KEY = "what-ferdowsi-let-in:theme";
const DEATHS_KEY = "what-ferdowsi-let-in:deaths";

const PALETTES = {
  dark:  { word: [244, 232, 206], ghost: [236, 226, 208], ghostA: .17, title: [214, 172, 96], death: [196, 44, 36] },
  light: { word: [20, 16, 12],    ghost: [42, 33, 28],    ghostA: .2, title: [140, 94, 20], death: [170, 24, 18] },
};

const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
const frame = document.getElementById("frame");
const ghostCanvas = document.getElementById("ghost");
const wordCanvas = document.getElementById("words");
const panel = document.getElementById("panel");
const hint = document.getElementById("hint");

let T, rows, perCol, cols, W, H, COL_W, ROW_H, BASE, COL_PITCH;
let lineX, lineY, lineS, lineRow, lineWords, lineAr, deathLine;
let arLine, arWord, arX0, arX1, arForm;
let cw = 1, ch = 1, dpr = 1;
let view = { s: 1, x: 0, y: 0 };
let pointer = null, shown = "";
let palette = PALETTES[document.documentElement.dataset.theme] || PALETTES.dark;
let showDeaths = (() => { try { return localStorage.getItem(DEATHS_KEY) === "1"; } catch (_) { return false; } })();
let dirty = true;

// ---------- layout: the book as a manuscript, columns read right to left ----------

const colEdge = c => W - MARGIN - c * COL_PITCH;
const colAt = x => Math.floor((W - MARGIN - x) / COL_PITCH);
const slotLeft = (c, h) => colEdge(c) - (h + 1) * COL_W - h * GUTTER;
const colCentre = c => colEdge(c) - COL_W - GUTTER / 2;
const bare = s => s.replace(/[\s‌]/g, "");

function layout() {
  ({ colW: COL_W, rowH: ROW_H, base: BASE } = T.page);
  COL_PITCH = 2 * COL_W + GUTTER + COL_GAP;
  rows = [];
  T.sections.forEach((s, si) => {
    rows.push({ kind: 2, si });
    s.poems.forEach((p, pi) => {
      const same = pi === 0 && (bare(p.title).startsWith(bare(s.title)) || bare(s.title).startsWith(bare(p.title)));
      if (!same) rows.push({ kind: 1, si, pi });
      for (let l = p.start; l < p.end; l += 2) rows.push({ kind: 0, l, si, pi });
    });
  });
  cols = Math.max(1, Math.round(Math.sqrt(ASPECT * ROW_H * rows.length / COL_PITCH)));
  perCol = Math.ceil(rows.length / cols);
  W = cols * COL_PITCH - COL_GAP + 2 * MARGIN;
  H = perCol * ROW_H + 2 * MARGIN;

  const n = T.lines.length;
  lineX = new Float32Array(n); lineY = new Float32Array(n); lineS = new Float32Array(n);
  lineRow = new Int32Array(n);
  rows.forEach((r, i) => {
    r.col = Math.floor(i / perCol);
    r.row = i % perCol;
    if (r.kind !== 0) return;
    for (let h = 0; h < 2 && r.l + h < n; h++) {
      const l = r.l + h;
      const w = T.widths[l] / T.upem;
      const s = Math.min(1, (COL_W - .4) / w);
      lineX[l] = slotLeft(r.col, h) + COL_W / 2 - w * s / 2;   // half-lines centred in their slots
      lineY[l] = MARGIN + r.row * ROW_H + BASE;
      lineS[l] = s;
      lineRow[l] = i;
    }
  });

  // the Arabic words, by line
  const a = T.arabic, k = a.length / 5;
  arLine = new Int32Array(k); arWord = new Int16Array(k); arX0 = new Float32Array(k); arX1 = new Float32Array(k); arForm = new Int32Array(k);
  lineAr = new Int32Array(n + 1);
  for (let i = 0; i < k; i++) {
    arLine[i] = a[i * 5]; arWord[i] = a[i * 5 + 1]; arForm[i] = a[i * 5 + 4];
    const l = arLine[i], f = lineS[l] / T.upem;
    arX0[i] = lineX[l] + a[i * 5 + 2] * f;
    arX1[i] = lineX[l] + a[i * 5 + 3] * f;
    lineAr[l + 1]++;
  }
  for (let l = 0; l < n; l++) lineAr[l + 1] += lineAr[l];
  lineWords = [];
  deathLine = new Uint8Array(n);
  // 1: a section headed with a killing or a death; 2: a couplet in it that says it
  for (const d of T.deaths) {
    for (let l = d.start; l < d.end; l++) deathLine[l] = 1;
    for (const l of d.lines) { deathLine[l] = 2; if (l + 1 < n) deathLine[l + 1] = 2; }
  }
}

// ---------- view ----------

const fitScale = () => Math.min(cw / W, ch / H);

function clampView() {
  view.s = Math.min(MAX_PX_PER_EM, Math.max(fitScale(), view.s));
  const pw = W * view.s, ph = H * view.s;
  view.x = pw <= cw ? (cw - pw) / 2 : Math.min(0, Math.max(cw - pw, view.x));
  view.y = ph <= ch ? (ch - ph) / 2 : Math.min(0, Math.max(ch - ph, view.y));
  dirty = true;
}

function fit() { view.s = fitScale(); clampView(); }

function resize() {
  const r = frame.getBoundingClientRect();
  const wasFit = Math.abs(view.s - fitScale()) < 1e-6;
  const cx = (cw / 2 - view.x) / view.s, cy = (ch / 2 - view.y) / view.s;
  cw = Math.max(1, r.width); ch = Math.max(1, r.height);
  dpr = Math.min(2, devicePixelRatio || 1);
  for (const c of [ghostCanvas, wordCanvas]) { c.width = Math.round(cw * dpr); c.height = Math.round(ch * dpr); }
  if (wasFit || !T) fit();
  else { view.x = cw / 2 - cx * view.s; view.y = ch / 2 - cy * view.s; clampView(); }
  ghost.key = words.key = "";
}

function zoomAt(px, py, f) {
  const s = Math.min(MAX_PX_PER_EM, Math.max(fitScale(), view.s * f));
  view.x = px - (px - view.x) * s / view.s;
  view.y = py - (py - view.y) * s / view.s;
  view.s = s;
  clampView();
}

// the wheel, the buttons and the keys set where the zoom is going; each frame eases toward it
let zoomGoal = null;
function zoomTo(px, py, f) {
  const s = Math.min(MAX_PX_PER_EM, Math.max(fitScale(), (zoomGoal ? zoomGoal.s : view.s) * f));
  zoomGoal = { s, px, py };
}

// ---------- what a stretch of the book looks like at one scale ----------

// the rows of the book inside a box of the page, at scale s, offset (ox, oy), w by h css px
function eachRow(s, ox, oy, w, h, fn) {
  const x0 = -ox / s, x1 = (w - ox) / s, y0 = -oy / s, y1 = (h - oy) / s;
  const cFrom = Math.max(0, Math.min(colAt(x0), colAt(x1)));
  const cTo = Math.min(cols - 1, Math.max(colAt(x0), colAt(x1)));
  const rFrom = Math.max(0, Math.floor((y0 - MARGIN) / ROW_H) - 1);
  const rTo = Math.min(perCol - 1, Math.ceil((y1 - MARGIN) / ROW_H) + 1);
  for (let c = cFrom; c <= cTo; c++) for (let rr = rFrom; rr <= rTo; rr++) {
    const row = rows[c * perCol + rr];
    if (!row) break;
    fn(row, c);
  }
}

const wordsOf = l => lineWords[l] || (lineWords[l] = T.lines[l].split(" "));
const rgba = (c, a) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;

// the ghost: the Persian, and the headings of the books and their sections
function setGhost(ctx, s, ox, oy, w, h) {
  ctx.direction = "rtl"; ctx.textBaseline = "alphabetic";
  let size = 0;
  eachRow(s, ox, oy, w, h, (row, c) => {
    if (row.kind === 0) {
      ctx.textAlign = "left";
      ctx.fillStyle = rgba(palette.ghost, palette.ghostA);
      for (let l = row.l; l < row.l + 2 && l < T.lines.length; l++) {
        const px = Math.round(s * lineS[l] * 100) / 100;
        if (px !== size) { ctx.font = `${px}px "Hand"`; size = px; }
        ctx.fillText(T.lines[l], lineX[l] * s + ox, lineY[l] * s + oy);
      }
    } else {
      const sec = T.sections[row.si];
      const title = row.kind === 2 ? sec.title : sec.poems[row.pi].title;
      ctx.font = `${s * (row.kind === 2 ? 1.25 : .85)}px "Hand"`; size = 0;
      ctx.textAlign = "center";
      ctx.fillStyle = rgba(palette.title, row.kind === 2 ? .8 : .55);
      ctx.fillText(title, colCentre(c) * s + ox, (MARGIN + row.row * ROW_H + BASE) * s + oy);
    }
  });
}

// what is left: the Arabic words, marked from far off and written out close up; and the deaths
function setWords(ctx, s, ox, oy, w, h) {
  ctx.direction = "rtl"; ctx.textBaseline = "alphabetic"; ctx.textAlign = "left";
  const write = s >= WORD_PX_PER_EM;
  const word = rgba(palette.word, 1), death = rgba(palette.death, .95), shade = rgba(palette.death, .16);
  if (write) ctx.font = `${s}px "Hand"`;
  let size = s;
  eachRow(s, ox, oy, w, h, (row, c) => {
    if (row.kind !== 0) return;
    if (showDeaths && deathLine[row.l]) {   // the section shaded red; the couplet that says it, a red rule
      const x = slotLeft(c, 1) * s + ox, w = (2 * COL_W + GUTTER) * s;
      ctx.fillStyle = shade;
      ctx.fillRect(x, (MARGIN + row.row * ROW_H) * s + oy, w, ROW_H * s + .5);
      if (deathLine[row.l] === 2) {
        ctx.fillStyle = death;
        ctx.fillRect(x, (MARGIN + row.row * ROW_H + BASE + .18) * s + oy, w, Math.max(1.2, .12 * s));
      }
    }
    ctx.fillStyle = word;
    for (let l = row.l; l < row.l + 2 && l < T.lines.length; l++) {
      for (let i = lineAr[l]; i < lineAr[l + 1]; i++) {
        const x = arX0[i] * s + ox, y = lineY[l] * s + oy;
        if (write) {
          const px = Math.round(s * lineS[l] * 100) / 100;
          if (px !== size) { ctx.font = `${px}px "Hand"`; size = px; }
          ctx.fillText(wordsOf(l)[arWord[i]], x, y);
        } else {   // a mark the width of the word, never smaller than a pixel or so
          const ww = Math.max(1.4, (arX1[i] - arX0[i]) * s), hh = Math.max(1.4, .42 * s);
          ctx.fillRect(x + ((arX1[i] - arX0[i]) * s - ww) / 2, y - .38 * s - hh / 2, ww, hh);
        }
      }
    }
  });
}

// ---------- tiles: each layer is set at whole steps of scale, the way a map is, and kept ----------

const TILE = 256;                // css px a side
const TILE_MS = 6;               // time to spend setting tiles in a frame

function TileLayer(canvas, set, tag) {
  return { canvas, ctx: canvas.getContext("2d"), set, tag, tiles: new Map(), for: "", pending: false, key: "" };
}
const ghost = TileLayer(ghostCanvas, setGhost, () => document.documentElement.dataset.theme);
const words = TileLayer(wordCanvas, setWords, () => `${document.documentElement.dataset.theme} ${showDeaths}`);

function tile(L, ts, tx, ty, make, keep) {
  const k = `${ts} ${tx} ${ty}`;
  const t = L.tiles.get(k);
  if (t) { L.tiles.delete(k); L.tiles.set(k, t); return t; }     // the most recently used go last
  if (!make) return null;
  let c;
  if (L.tiles.size >= keep) { const old = L.tiles.keys().next().value; c = L.tiles.get(old); L.tiles.delete(old); }
  else c = document.createElement("canvas");
  c.width = c.height = Math.round(TILE * dpr);                   // also clears it
  const x = c.getContext("2d");
  x.setTransform(dpr, 0, 0, dpr, 0, 0);
  L.set(x, ts, -tx * TILE, -ty * TILE, TILE, TILE);
  L.tiles.set(k, c);
  return c;
}

function drawLayer(L, alpha, until) {
  const key = `${view.s.toFixed(3)} ${view.x.toFixed(1)} ${view.y.toFixed(1)} ${alpha.toFixed(3)} ${cw} ${ch}`;
  if (key === L.key && !L.pending) return;
  L.key = key;
  const lctx = L.ctx;
  lctx.setTransform(1, 0, 0, 1, 0, 0);
  lctx.clearRect(0, 0, L.canvas.width, L.canvas.height);
  L.pending = false;
  if (alpha < .005) return;
  const tag = `${L.tag()} ${dpr}`;
  if (tag !== L.for) { L.tiles.clear(); L.for = tag; }
  const ts = Math.min(128, 2 ** Math.round(Math.log2(view.s)));
  const step = TILE / ts * view.s;                               // a tile on screen, css px
  const tx0 = Math.floor(-view.x / step), tx1 = Math.floor((cw - view.x) / step);
  const ty0 = Math.floor(-view.y / step), ty1 = Math.floor((ch - view.y) / step);
  const keep = 3 * (tx1 - tx0 + 1) * (ty1 - ty0 + 1);
  const px = v => Math.round(v * dpr);
  lctx.globalAlpha = alpha;
  for (let ty = ty0; ty <= ty1; ty++) {
    const Y0 = px(view.y + ty * step), Y1 = px(view.y + (ty + 1) * step);
    for (let tx = tx0; tx <= tx1; tx++) {
      const X0 = px(view.x + tx * step), X1 = px(view.x + (tx + 1) * step);
      const c = tile(L, ts, tx, ty, performance.now() < until, keep);
      if (c) { lctx.drawImage(c, X0, Y0, X1 - X0, Y1 - Y0); continue; }
      L.pending = true;
      const p = tile(L, ts / 2, tx >> 1, ty >> 1, false);         // a quarter of the coarser step's tile
      if (p) { const q = p.width / 2; lctx.drawImage(p, (tx & 1) * q, (ty & 1) * q, q, q, X0, Y0, X1 - X0, Y1 - Y0); continue; }
      const XM = X0 + Math.round((X1 - X0) / 2), YM = Y0 + Math.round((Y1 - Y0) / 2);
      for (let j = 0; j < 2; j++) for (let i = 0; i < 2; i++) {   // or the finer step's four
        const f = tile(L, ts * 2, tx * 2 + i, ty * 2 + j, false);
        if (f) lctx.drawImage(f, i ? XM : X0, j ? YM : Y0, i ? X1 - XM : XM - X0, j ? Y1 - YM : YM - Y0);
      }
    }
  }
  lctx.globalAlpha = 1;
}

// ---------- the couplet under the pointer ----------

const esc = s => s.replace(/[&<>]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]);

// the Arabic word nearest the pointer, within a few pixels; or, close up, the line under it
function under(px, py) {
  const x = (px - view.x) / view.s, y = (py - view.y) / view.s;
  const c = colAt(x);
  if (c < 0 || c >= cols) return null;
  const reach = 9 / view.s;
  const r0 = Math.max(0, Math.floor((y - reach - MARGIN) / ROW_H)), r1 = Math.min(perCol - 1, Math.floor((y + reach - MARGIN) / ROW_H));
  let best = -1, bd = reach;
  for (let rr = r0; rr <= r1; rr++) {
    const row = rows[c * perCol + rr];
    if (!row || row.kind !== 0) continue;
    for (let l = row.l; l < row.l + 2 && l < T.lines.length; l++) for (let i = lineAr[l]; i < lineAr[l + 1]; i++) {
      const dx = x < arX0[i] ? arX0[i] - x : x > arX1[i] ? x - arX1[i] : 0;
      const d = Math.hypot(dx, y - (lineY[l] - .38));
      if (d < bd) { bd = d; best = i; }
    }
  }
  if (best >= 0) return { l: arLine[best], i: best };
  if (view.s < READ_PX_PER_EM * .6) return null;
  const rr = Math.floor((y - MARGIN) / ROW_H), row = rows[c * perCol + rr];
  if (!row || row.kind !== 0) return null;
  for (let h = 0; h < 2; h++) if (x >= slotLeft(c, h) && x <= slotLeft(c, h) + COL_W) return { l: row.l + h, i: -1 };
  return null;
}

function showPanel(u) {
  const key = u ? `${u.l} ${u.i}` : "";
  if (key === shown) return;
  shown = key;
  if (!u) { panel.classList.remove("show"); return; }
  const row = rows[lineRow[u.l]];
  const sec = T.sections[row.si], poem = sec.poems[row.pi];
  const half = l => {
    const ws = wordsOf(l).map(esc);
    for (let i = lineAr[l]; i < lineAr[l + 1]; i++) ws[arWord[i]] = `<b${i === u.i ? ' class="this"' : ""}>${ws[arWord[i]]}</b>`;
    return ws.join(" ");
  };
  document.getElementById("where").innerHTML =
    `<span lang="fa">${esc(sec.title)}${poem.title !== sec.title ? " · " + esc(poem.title) : ""}</span>`;
  document.getElementById("couplet").innerHTML = `${half(row.l)}<span class="sep">✦</span>${half(row.l + 1)}`;
  const n = lineAr[row.l + 2 <= T.lines.length ? row.l + 2 : row.l + 1] - lineAr[row.l];
  let what = `couplet ${(row.l / 2 + 1).toLocaleString("en")} of ${(T.lines.length / 2).toLocaleString("en")} · ` +
    (n ? `${n} Arabic ${n === 1 ? "word" : "words"}` : "no Arabic");
  if (deathLine[row.l] === 2) what += " · a death";
  const g = document.getElementById("gloss");
  if (u.i >= 0) {
    const [form, rom, sense] = T.forms[arForm[u.i]];
    g.innerHTML = `<span lang="fa">${esc(form)}</span>${rom ? ` <i>${esc(rom)}</i>` : ""}${sense ? `, ${esc(sense)}` : ""} <small>from Arabic</small>`;
  } else g.innerHTML = "";
  document.getElementById("count").textContent = what;
  panel.classList.add("show");
}

// ---------- input ----------

const pts = new Map();
let pinch = null, dragFrom = null;
const local = e => { const r = frame.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };

wordCanvas.addEventListener("pointerdown", e => {
  wordCanvas.setPointerCapture(e.pointerId);
  zoomGoal = null;
  pts.set(e.pointerId, local(e));
  if (pts.size === 1) { dragFrom = local(e); wordCanvas.classList.add("dragging"); }
  if (pts.size === 2) { const [a, b] = [...pts.values()]; pinch = { d: Math.hypot(a[0] - b[0], a[1] - b[1]) }; }
});
wordCanvas.addEventListener("pointermove", e => {
  const p = local(e);
  pointer = p;
  if (!pts.has(e.pointerId)) return;
  const prev = pts.get(e.pointerId);
  pts.set(e.pointerId, p);
  if (pts.size === 2 && pinch) {
    const [a, b] = [...pts.values()];
    const d = Math.hypot(a[0] - b[0], a[1] - b[1]);
    zoomAt((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, d / pinch.d);
    pinch.d = d;
  } else if (pts.size === 1) {
    if (dragFrom && Math.hypot(p[0] - dragFrom[0], p[1] - dragFrom[1]) < 3) return;
    dragFrom = null;
    view.x += p[0] - prev[0]; view.y += p[1] - prev[1];
    clampView();
  }
});
function release(e) {
  pts.delete(e.pointerId);
  if (pts.size < 2) pinch = null;
  if (pts.size === 0) wordCanvas.classList.remove("dragging");
  if (e.pointerType !== "mouse" && pts.size === 0) pointer = null;
}
wordCanvas.addEventListener("pointerup", release);
wordCanvas.addEventListener("pointercancel", release);
wordCanvas.addEventListener("pointerleave", () => { if (!pts.size) pointer = null; });
wordCanvas.addEventListener("wheel", e => {
  e.preventDefault();
  const [x, y] = local(e);
  const dy = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
  zoomTo(x, y, Math.exp(-dy * (e.ctrlKey ? .01 : .0022)));   // ctrl: a trackpad pinch
}, { passive: false });

const centre = () => [cw / 2, ch / 2];
document.getElementById("zoom-in").onclick = () => zoomTo(...centre(), 1.8);
document.getElementById("zoom-out").onclick = () => zoomTo(...centre(), 1 / 1.8);
document.getElementById("reset").onclick = () => { zoomGoal = null; fit(); };

const deathsBtn = document.getElementById("deaths");
function useDeaths(on) {
  showDeaths = on;
  deathsBtn.setAttribute("aria-pressed", on);
  document.body.classList.toggle("deaths", on);
  try { localStorage.setItem(DEATHS_KEY, on ? "1" : "0"); } catch (_) {}
  shown = ""; dirty = true;
}
deathsBtn.onclick = () => useDeaths(!showDeaths);

addEventListener("keydown", e => {
  if (e.target.closest && e.target.closest("input, textarea")) return;
  const r = frame.getBoundingClientRect();
  if (r.bottom < 0 || r.top > innerHeight) return;
  const k = e.key, step = 80;
  if (k === "+" || k === "=") zoomTo(...centre(), 1.5);
  else if (k === "-" || k === "_") zoomTo(...centre(), 1 / 1.5);
  else if (k === "0") { zoomGoal = null; fit(); }
  else if (k === "d" || k === "D") useDeaths(!showDeaths);
  else if (k.startsWith("Arrow")) {
    e.preventDefault();
    view.x += k === "ArrowLeft" ? step : k === "ArrowRight" ? -step : 0;
    view.y += k === "ArrowUp" ? step : k === "ArrowDown" ? -step : 0;
    clampView();
  }
});

const themeBtn = document.getElementById("theme");
function labelTheme() { themeBtn.textContent = document.documentElement.dataset.theme === "light" ? "dark" : "light"; }
themeBtn.onclick = () => {
  const next = document.documentElement.dataset.theme === "light" ? "dark" : "light";
  document.documentElement.dataset.theme = next;
  try { localStorage.setItem(THEME_KEY, next); } catch (_) {}
  palette = PALETTES[next];
  labelTheme(); shown = ""; dirty = true;
};
labelTheme();

// ---------- the loop ----------

let then = performance.now(), running = true;
const t0 = then;

function frameLoop(now) {
  if (!running) return;
  const dt = Math.min(100, now - then);
  then = now;
  if (zoomGoal) {
    const r = zoomGoal.s / view.s;
    if (Math.abs(Math.log(r)) < 1e-3) { zoomAt(zoomGoal.px, zoomGoal.py, r); zoomGoal = null; }
    else zoomAt(zoomGoal.px, zoomGoal.py, Math.pow(r, 1 - Math.pow(1e-6, dt / 1000)));
  }
  if (dirty) { ghost.key = words.key = ""; dirty = false; }
  const until = performance.now() + TILE_MS;
  drawLayer(words, 1, until);
  drawLayer(ghost, Math.min(1, Math.max(0, (view.s - READ_PX_PER_EM * .6) / (READ_PX_PER_EM * .4))), until);
  showPanel(pointer && !pts.size ? under(...pointer) : null);
  if (view.s > fitScale() * 1.5 && now - t0 > 4000) hint.classList.add("gone");
  requestAnimationFrame(frameLoop);
}

function wake() {
  const visible = !document.hidden && frameVisible;
  if (visible && !running) { running = true; then = performance.now(); requestAnimationFrame(frameLoop); }
  else if (!visible) running = false;
}
let frameVisible = true;
new IntersectionObserver(([en]) => { frameVisible = en.isIntersecting; wake(); }).observe(frame);
document.addEventListener("visibilitychange", wake);

// ---------- start ----------

(async () => {
  const [text] = await Promise.all([
    fetch("data/text.json").then(r => r.json()),
    new FontFace("Hand", "url(data/hand.woff2)").load().then(f => document.fonts.add(f)).catch(() => {}),
  ]);
  T = text;
  layout();
  frame.style.setProperty("--aspect", (W / H).toFixed(3));
  resize();
  useDeaths(showDeaths || new URLSearchParams(location.search).get("deaths") === "1");
  new ResizeObserver(resize).observe(frame);
  requestAnimationFrame(frameLoop);
})().catch(err => {
  console.error(err);
  frame.insertAdjacentHTML("beforeend", `<p class="fallback">The book could not be loaded.</p>`);
});
