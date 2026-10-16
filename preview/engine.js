// Preview engine for indicators/htf-swing-lows: PROPOSED v1.0.0 logic (not yet in the Pine code).
// HTF swing-low sweeps, each paired with CISDs on fixed lower timeframes (15m -> 1m + 3m, 30m -> 3m, 1H -> 5m).
// TradingView is the source of truth; this copy is only for quick visual checks.
(function (global) {
  "use strict";

  // Colour and thickness tell the CISD timeframes apart (no labels).
  const CISD_TFS = [
    { name: "1m", sec: 60,  color: "#66bb6a", width: 1 },
    { name: "3m", sec: 180, color: "#2e7d32", width: 2 },
    { name: "5m", sec: 300, color: "#004d40", width: 3 },
  ];

  // HTF slots. pairs = CISD timeframes (seconds) to look for after a sweep of this slot's low.
  const SLOTS = [
    { name: "5m",  sec: 300,   color: "#C2185B", on: true,  pairs: [] },
    { name: "15m", sec: 900,   color: "#2962FF", on: true,  pairs: [60, 180] },
    { name: "30m", sec: 1800,  color: "#8E24AA", on: true,  pairs: [180] },
    { name: "1H",  sec: 3600,  color: "#F57C00", on: true,  pairs: [300] },
    { name: "4H",  sec: 14400, color: "#D32F2F", on: true,  pairs: [] },
    { name: "1D",  sec: 86400, color: "#5D4037", on: false, pairs: [] },
  ];

  // "Show on chart timeframe" rows: chart seconds -> slot indexes (0-based).
  const ROWS = [
    { sec: 30,   slots: [0, 1] },
    { sec: 60,   slots: [1, 2, 3] },
    { sec: 180,  slots: [1, 2, 3] },
    { sec: 300,  slots: [3] },
    { sec: 900,  slots: [4] },
    { sec: 1800, slots: [4] },
    { sec: 3600, slots: [4] },
  ];

  function tfName(sec) {
    if (sec >= 86400) return Math.round(sec / 86400) + "D";
    if (sec >= 3600) return Math.round(sec / 3600) + "H";
    if (sec >= 60) return Math.round(sec / 60) + "m";
    return sec + "s";
  }

  function defaultSlotsFor(chartSec) {
    const row = ROWS.findIndex((r) => r.sec === chartSec);
    const wanted = row >= 0 ? SLOTS.map((_, k) => ROWS[row].slots.includes(k)) : SLOTS.map((s) => s.on);
    return { row, wanted };
  }

  // bars: [{t (unix seconds, bar open), o, h, l, c}] oldest first.
  function run(bars, o) {
    const n = bars.length;
    const lastBar = o.lastBarLive ? n - 2 : n - 1;   // a live last bar is still forming: skip it, like Pine's barstate.isconfirmed
    const anchor = o.anchorSec || 0;                 // HTF candles start at the session anchor (18:00 New York for CME)
    const bucket = (t, sec) => Math.floor((t - anchor) / sec);
    const c = o.cisd;

    const trackers = SLOTS.map((s, k) => ({
      name: s.name, sec: s.sec, col: s.color,
      on: o.wanted[k] && s.sec > o.chartSec,
      pairs: (o.pairs[k] || []).filter((p) => p < s.sec),
      prevLow: null, prevLowBar: null, curLow: null, curLowBar: null, curClose: null,
      current: null,   // sweep made by the forming HTF candle
      armed: [],       // sweeps whose CISD window is still open
      kept: [],        // confirmed sweeps, for drawing
    }));
    const active = trackers.filter((t) => t.on);

    // ── HTF sweeps ─────────────────────────────────────────
    // A sweep: the forming HTF candle trades below the previous HTF candle's low.
    // Confirmed when that candle closes back above the low; dropped if it closes at or below it.
    // Its CISD window lasts for the sweeping candle plus `wait` more HTF candles, and ends early
    // if any later HTF candle closes at or below the swept low.
    function update(tr, i, newHtf) {
      const b = bars[i];
      if (newHtf || tr.curLow === null) {
        if (tr.curClose !== null) {
          const sw = tr.current;
          if (sw && tr.curClose > sw.low) {
            sw.confirmed = true;
            sw.endBar = Math.max(sw.endBar, i - 1 + o.overshoot);
            tr.kept.push(sw);
            if (tr.kept.length > o.maxKept) tr.kept.shift();
          }
          for (const a of tr.armed) a.armedFor = tr.curClose <= a.low ? 0 : a.armedFor - 1;
          tr.armed = tr.armed.filter((a) => a.armedFor > 0);
          tr.current = null;
        }
        tr.prevLow = tr.curLow;
        tr.prevLowBar = tr.curLowBar;
        tr.curLow = b.l;
        tr.curLowBar = i;
      } else if (b.l < tr.curLow) {
        tr.curLow = b.l;
        tr.curLowBar = i;
      }
      tr.curClose = b.c;

      if (tr.prevLow !== null && tr.curLow < tr.prevLow) {
        if (!tr.current) {
          tr.current = { tr, low: tr.prevLow, lowBar: tr.prevLowBar, startBar: i, endBar: i + o.overshoot,
                         armedFor: 1 + c.wait, confirmed: false, done: new Set() };
          tr.armed.push(tr.current);
        } else {
          tr.current.endBar = Math.max(tr.current.endBar, i + o.overshoot);
        }
      }
    }

    // ── CISD machines, one per paired timeframe ────────────
    const pairedSecs = [...new Set(active.flatMap((t) => t.pairs))].sort((a, b) => a - b);
    const machines = pairedSecs.map((sec) => ({
      sec,
      def: CISD_TFS.find((d) => d.sec === sec) || { name: tfName(sec), sec, color: "#2e7d32", width: 2 },
      ok: sec >= o.chartSec && sec % o.chartSec === 0,   // must be buildable from chart candles
      candles: [], cur: null, bias: 0, level: null, levelIdx: null, extreme: null, marks: [],
    }));
    const runnable = machines.filter((m) => m.ok);

    const dirC = (C, j) => {
      if (j < 0) return 0;
      const x = C[j];
      return x.c > x.o ? 1 : x.c < x.o ? -1 : 0;
    };

    // Extreme open of the latest run of bias-direction candles (dojis skipped), and its candle index.
    function scanRun(C, j, bias, includeCurrent) {
      let ext = includeCurrent ? C[j].o : null;
      let farthest = 0;
      let started = includeCurrent;
      for (let k = 1; k <= 500 && j - k >= 0; k++) {
        const d = dirC(C, j - k);
        if (d === 0) continue;
        if (d === bias) {
          started = true;
          farthest = k;
          const op = C[j - k].o;
          ext = ext === null ? op : bias === 1 ? Math.min(ext, op) : Math.max(ext, op);
        } else if (started) break;
      }
      if (ext === null) ext = C[j].o;
      let shift = 0;
      for (let k = includeCurrent || farthest === 0 ? 0 : 1; k <= farthest; k++) {
        if (C[j - k].o === ext) { shift = k; break; }
      }
      return [ext, j - shift];
    }

    // Open sweeps that pair with this CISD timeframe, started no later than endBar, and have no CISD on it yet.
    function openSweeps(m, endBar) {
      const out = [];
      for (const t of active) {
        if (!t.pairs.includes(m.sec)) continue;
        for (const a of t.armed) if (a.armedFor > 0 && a.startBar <= endBar && !a.done.has(m.sec)) out.push(a);
      }
      return out;
    }

    function completeCandle(m) {
      const C = m.candles;
      C.push(m.cur);
      m.cur = null;
      const j = C.length - 1;
      const b = C[j];
      const d0 = dirC(C, j);

      if (m.bias === 0 && j > 10) {
        let first = d0;
        if (first === 0) for (let k = 1; k <= 50; k++) { first = dirC(C, j - k); if (first !== 0) break; }
        if (first !== 0) {
          m.bias = first;
          [m.level, m.levelIdx] = scanRun(C, j, first, true);
          m.extreme = first === 1 ? b.h : b.l;
        }
      }
      if (m.bias === 0) return;

      const newExtreme = m.bias === 1 ? b.h > m.extreme : b.l < m.extreme;
      if (newExtreme) {
        m.extreme = m.bias === 1 ? b.h : b.l;
        [m.level, m.levelIdx] = scanRun(C, j, m.bias, d0 === m.bias);
      }

      const bull = m.bias === -1 && b.c > m.level;
      const bear = m.bias === 1 && b.c < m.level;
      if (!bull && !bear) return;

      const sweeps = bull ? openSweeps(m, b.endBar) : [];
      const allowed = !c.gate || sweeps.length > 0;
      const wanted = allowed && (c.filter === "Both" || (c.filter === "Bullish Only" && bull) || (c.filter === "Bearish Only" && bear));
      if (wanted) {
        m.marks.push({ x1: C[m.levelIdx].startBar, x2: b.endBar + c.extend, y: m.level,
                       color: bull ? m.def.color : c.bearColor, style: "solid", width: m.def.width });
        if (m.marks.length > c.max) m.marks.shift();
      }
      // First CISD per sweep per timeframe: the sweep line runs to it, and later ones on this timeframe are ignored.
      if (allowed) for (const s of sweeps) { s.done.add(m.sec); s.endBar = Math.max(s.endBar, b.endBar); }

      m.bias = bull ? 1 : -1;
      [m.level, m.levelIdx] = scanRun(C, j, m.bias, true);
      m.extreme = m.bias === 1 ? b.h : b.l;
    }

    // ── Bar loop ───────────────────────────────────────────
    for (let i = 0; i <= lastBar; i++) {
      const b = bars[i];
      // 1. CISD candles that ended on the previous bar, judged against the sweeps as they stood then.
      if (c.show) for (const m of runnable) if (m.cur && bucket(b.t, m.sec) !== m.cur.bucket) completeCandle(m);
      // 2. HTF sweeps.
      for (const tr of active) {
        const newHtf = i === 0 || bucket(b.t, tr.sec) !== bucket(bars[i - 1].t, tr.sec);
        update(tr, i, newHtf);
      }
      // 3. Add this bar to the forming CISD candles.
      if (c.show) for (const m of runnable) {
        if (!m.cur) m.cur = { bucket: bucket(b.t, m.sec), o: b.o, h: b.h, l: b.l, c: b.c, startBar: i, endBar: i };
        else { m.cur.h = Math.max(m.cur.h, b.h); m.cur.l = Math.min(m.cur.l, b.l); m.cur.c = b.c; m.cur.endBar = i; }
      }
    }

    // ── Drawings (no labels) ───────────────────────────────
    // One line per swept low: when 15m / 30m / 1H swept the same low, draw it once in the highest timeframe's colour.
    const sweepLines = new Map();
    for (const t of active) {
      const list = t.kept.slice();
      if (t.current && o.showPotential) list.push(t.current);
      for (const s of list) {
        if (s.confirmed && !o.showConfirmed) continue;
        const key = s.lowBar + "|" + s.low;
        const style = s.confirmed ? o.confirmedStyle : o.potentialStyle;
        const prev = sweepLines.get(key);
        if (!prev) {
          sweepLines.set(key, { x1: s.lowBar, x2: s.endBar, y: s.low, color: t.col, style, width: o.lineWidth, sec: t.sec });
        } else {
          prev.x2 = Math.max(prev.x2, s.endBar);
          if (s.confirmed) prev.style = o.confirmedStyle;
          if (t.sec > prev.sec) { prev.sec = t.sec; prev.color = t.col; }
        }
      }
    }

    const lines = [...sweepLines.values()];
    for (const m of runnable) lines.push(...m.marks);

    // Pending CISD: the level price must still close above, while a paired sweep is open.
    if (c.show && c.gate && c.pending && c.filter !== "Bearish Only") {
      for (const m of runnable) {
        if (m.bias === -1 && m.levelIdx !== null && openSweeps(m, lastBar).length) {
          lines.push({ x1: m.candles[m.levelIdx].startBar, x2: lastBar, y: m.level, color: m.def.color, style: "dashed", width: m.def.width });
        }
      }
    }

    const row = ROWS.findIndex((r) => r.sec === o.chartSec);
    const status = {
      chart: tfName(o.chartSec),
      row: row >= 0 ? "Row " + (row + 1) : "none, using HTF checkboxes",
      sweeps: active.length
        ? active.map((t) => t.name + (t.pairs.length ? " → CISD " + t.pairs.map(tfName).join(" + ") : " (no CISD paired)")).join(", ")
        : "none (nothing will be drawn)",
      cisd: !c.show ? "off" : machines.length
        ? machines.map((m) => m.def.name + ": " + (m.ok ? (m.bias === 1 ? "bullish" : m.bias === -1 ? "bearish" : "starting") : "can't be built from " + tfName(o.chartSec) + " candles")).join(", ")
        : "no CISD timeframe paired",
      comingOutOf: active.filter((t) => t.armed.length).map((t) => t.name).join(", ") || "no swept low right now",
      lines: lines.length,
    };
    return { lines, status };
  }

  global.PreviewEngine = { CISD_TFS, SLOTS, ROWS, tfName, defaultSlotsFor, run };
})(window);
