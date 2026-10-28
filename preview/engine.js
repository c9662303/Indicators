// Preview engine for indicators/htf-swing-lows v1.1.0 "swing point model" (same rules as the Pine code).
//
// 1. Context: the 4H or Daily is forming or has just confirmed a swing point (C2), from a real low
//    (C2 took C1's low) or an SMT low (a correlated index took its low, this one did not).
// 2. Internal: inside that context, 1H / 30m / 15m swing points (C2) are the setups. With the fractal rule on,
//    the internal C2's low must be the context C2's low (the internal swing is what forms the higher-TF low).
// 3. Entry: the first valid CISD on the paired lower timeframe (1H -> 5m, 30m -> 3m, 15m -> 1m + 3m).
//    Valid = the run of down-close candles it closes above started inside the internal C2 candle or later.
// Bearish is the same logic run on a price-mirrored chart.
// TradingView is the source of truth; this copy is only for quick visual checks.
(function (global) {
  "use strict";

  const CTX_TFS = [
    { key: "W",  name: "1W", sec: 604800, color: "#455A64", on: false },
    { key: "D",  name: "1D", sec: 86400, color: "#5D4037", on: true },
    { key: "4H", name: "4H", sec: 14400, color: "#00838F", on: true },
  ];
  const INT_TFS = [
    { key: "1H",  name: "1H",  sec: 3600, color: "#F57C00", pairs: [300] },
    { key: "30m", name: "30m", sec: 1800, color: "#8E24AA", pairs: [180] },
    { key: "15m", name: "15m", sec: 900,  color: "#2962FF", pairs: [60, 180] },
  ];
  // Colour and thickness tell the CISD timeframes apart (no labels).
  const CISD_TFS = [
    { name: "1m", sec: 60,  bull: "#66bb6a", bear: "#ef9a9a", width: 1 },
    { name: "3m", sec: 180, bull: "#2e7d32", bear: "#e53935", width: 2 },
    { name: "5m", sec: 300, bull: "#004d40", bear: "#b71c1c", width: 3 },
  ];

  function tfName(sec) {
    if (sec >= 86400) return Math.round(sec / 86400) + "D";
    if (sec >= 3600) return Math.round(sec / 3600) + "H";
    if (sec >= 60) return Math.round(sec / 60) + "m";
    return sec + "s";
  }

  const mirror = (bars) => bars.map((b) => ({ t: b.t, o: -b.o, h: -b.l, l: -b.h, c: -b.c }));

  // One direction (bullish). bars: chart candles; others: correlated assets' 1m candles (same price direction).
  function runSide(bars, others, o, bull) {
    const n = bars.length;
    const lastBar = o.lastBarLive ? n - 2 : n - 1;
    const anchor = o.anchorSec || 0;
    const bucket = (t, sec) => Math.floor((t - anchor) / sec);

    const make = (def, isCtx) => ({
      def, isCtx, sec: def.sec,
      on: (isCtx ? o.ctx[def.key] : o.internal[def.key]) && def.sec > o.chartSec,
      pairs: isCtx ? [] : (o.pairs[def.key] || []).filter((p) => p < def.sec),
      bucket: null, prevLow: null, prevLowBar: null, prevHigh: null, curLow: null, curLowBar: null, curHigh: null,
      curOpen: null, curClose: null, curStart: null,
      contLeft: 0, contMid: null, contStart: null, contLines: [],   // continuation window after an expansion candle
      oth: others.map(() => ({ bucket: null, low: null, prevLow: null })),
      current: null,  // C2 forming now
      live: [],       // C2s whose C3 (and wait candles) are still running
      drawn: [],      // for drawing
    });
    const ctxT = CTX_TFS.map((d) => make(d, true)).filter((t) => t.on);
    const intT = INT_TFS.map((d) => make(d, false)).filter((t) => t.on);
    const ptr = others.map(() => 0);

    // ── Swing points (C1 / C2 / C3) ───────────────────────
    const othersSwept = (tr) => tr.oth.some((st) => st.bucket === tr.bucket && st.prevLow !== null && st.low < st.prevLow);

    function feedOther(st, b, sec) {
      const bk = bucket(b.t, sec);
      if (st.bucket !== bk) { st.prevLow = st.low; st.bucket = bk; st.low = b.l; }
      else if (b.l < st.low) st.low = b.l;
    }

    // The HTF candle that just closed (on bar i-1): settle C3s, then turn the C2 into a C3.
    function closeCandle(tr, i) {
      // Continuation: the candle that just closed above the previous candle's high is an expansion candle
      // (bearish side: closed below the previous low, a failure to manipulate it). The next candle is the window.
      if (tr.contLeft > 0) tr.contLeft -= 1;
      if (tr.isCtx && o.cont && tr.prevHigh !== null && tr.curClose > tr.prevHigh) {
        tr.contLeft = 1;
        tr.contMid = (tr.curHigh + tr.curLow) / 2;
        tr.contStart = i;
        tr.contLines.push({ x1: tr.curStart, x2: i, y: tr.contMid, color: tr.def.color, style: "dotted", width: 1 });
        if (tr.contLines.length > Math.min(o.maxKept, 10)) tr.contLines.shift();
      }
      for (const s of tr.live) {
        if (!s.c3Settled) {
          s.c3Settled = true;
          s.endBar = Math.max(s.endBar, i - 1);
          if (s.type === 2 && !(tr.curClose > s.c2Open)) s.failed = true;   // type 2 needs C3 to close above C2's open
        }
        s.left -= 1;
      }
      tr.live = tr.live.filter((s) => s.left > 0 && !s.failed);
      const s = tr.current;
      if (s) {
        s.phase = "C3";
        s.left -= 1;
        s.type = s.kind === "smt" || tr.curClose > s.low ? 1 : 2;   // 1 = closed back inside C1, 2 = closed below (needs C3)
        s.endBar = Math.max(s.endBar, i - 1 + o.overshoot);
        tr.live.push(s);
        tr.current = null;
      }
    }

    function update(tr, i) {
      const b = bars[i];
      const bk = bucket(b.t, tr.sec);
      if (tr.bucket === null || bk !== tr.bucket) {
        if (tr.bucket !== null) closeCandle(tr, i);
        tr.prevLow = tr.curLow;
        tr.prevLowBar = tr.curLowBar;
        tr.prevHigh = tr.curHigh;
        tr.bucket = bk;
        tr.curLow = b.l; tr.curLowBar = i; tr.curHigh = b.h; tr.curOpen = b.o; tr.curStart = i;
      } else {
        if (b.l < tr.curLow) { tr.curLow = b.l; tr.curLowBar = i; }
        tr.curHigh = Math.max(tr.curHigh, b.h);
      }
      tr.curClose = b.c;
      if (tr.contLeft > 0 && tr.contLines.length) tr.contLines[tr.contLines.length - 1].x2 = i;
      if (tr.current) tr.current.c2Low = tr.curLow;
      for (const s of tr.live) if (!s.c3Settled) s.endBar = Math.max(s.endBar, i);   // line runs through C3

      if (tr.prevLow === null) return;
      const real = tr.curLow < tr.prevLow;
      const smt = !real && o.smt && othersSwept(tr);
      if (!real && !smt) return;
      if (!tr.current) {
        tr.current = {
          tr, kind: real ? "real" : "smt", low: tr.prevLow, lowBar: tr.prevLowBar,
          c2Start: tr.curStart, c2Open: tr.curOpen, c2Low: tr.curLow, startBar: i, endBar: i + o.overshoot,
          phase: "C2", type: 0, failed: false, c3Settled: false, ctxOk: tr.isCtx,
          left: 2 + (tr.isCtx ? 0 : o.wait), done: new Set(), prop: new Set(),
        };
        tr.drawn.push(tr.current);
        if (tr.drawn.length > o.maxKept) tr.drawn.shift();
      } else {
        if (real) tr.current.kind = "real";
        tr.current.endBar = Math.max(tr.current.endBar, i + o.overshoot);
      }
    }

    const ctxSweeps = () => ctxT.flatMap((t) => (t.current ? [t.current] : []).concat(t.live));
    const ctxOkSweeps = () => ctxSweeps().filter((s) => !s.failed && (!o.ctxSmtOnly || s.kind === "smt"));
    const ctxActive = () => ctxOkSweeps().length > 0 || ctxT.some((t) => t.contLeft > 0);
    // C2 context: with "fractal" on, the setup's C2 low must be the context C2's low.
    // Continuation context: the setup formed after the expansion candle closed and its low holds that candle's near half.
    const fitsContext = (s) =>
      ctxOkSweeps().some((c) => !o.fractal || c.c2Low === s.c2Low) ||
      ctxT.some((t) => t.contLeft > 0 && s.startBar >= t.contStart && s.c2Low >= t.contMid);

    // ── CISD machines, one per paired timeframe ────────────
    const pairedSecs = [...new Set(intT.flatMap((t) => t.pairs))].sort((a, b) => a - b);
    const machines = pairedSecs.map((sec) => ({
      sec,
      def: CISD_TFS.find((d) => d.sec === sec) || { name: tfName(sec), sec, bull: "#2e7d32", bear: "#e53935", width: 2 },
      ok: sec >= o.chartSec && sec % o.chartSec === 0,
      candles: [], cur: null, bias: 0, level: null, levelIdx: null, extreme: null, marks: [], count: 0,
      pbLevel: null, pbIdx: null, pbArmed: false,   // propulsion block
    }));
    const runnable = machines.filter((m) => m.ok);

    const dirC = (C, j) => {
      if (j < 0) return 0;
      const x = C[j];
      return x.c > x.o ? 1 : x.c < x.o ? -1 : 0;
    };

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

    // Internal C2s this CISD can confirm: in context, window open, the down-close run started inside C2 or later.
    function setupsFor(m, endBar, levelStart) {
      const out = [];
      for (const t of intT) {
        if (!t.pairs.includes(m.sec)) continue;
        for (const s of (t.current ? [t.current] : []).concat(t.live)) {
          if (!s.failed && s.ctxOk && s.startBar <= endBar && levelStart >= s.c2Start && !s.done.has(m.sec)
              && fitsContext(s)) out.push(s);
        }
      }
      return out;
    }

    // Setups whose first CISD on this timeframe is in and whose propulsion block is still open.
    function propSetups(m, endBar) {
      const out = [];
      for (const t of intT) {
        if (!t.pairs.includes(m.sec)) continue;
        for (const s of (t.current ? [t.current] : []).concat(t.live)) {
          if (!s.failed && s.ctxOk && s.done.has(m.sec) && !s.prop.has(m.sec) && s.startBar <= endBar && fitsContext(s)) out.push(s);
        }
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

      if (m.bias === 1 ? b.h > m.extreme : b.l < m.extreme) {
        m.extreme = m.bias === 1 ? b.h : b.l;
        [m.level, m.levelIdx] = scanRun(C, j, m.bias, d0 === m.bias);
      }

      const up = m.bias === -1 && b.c > m.level;
      const down = m.bias === 1 && b.c < m.level;
      if (!up && !down) {
        // Propulsion block: after the CISD, a pullback run of opposite candles that price closes through again.
        if (o.prop && m.bias === 1) {
          if (d0 === -1) { [m.pbLevel, m.pbIdx] = scanRun(C, j, -1, true); m.pbArmed = true; }
          else if (m.pbArmed && d0 === 1 && b.c > m.pbLevel) {
            m.pbArmed = false;
            const props = propSetups(m, b.endBar);
            if (props.length) {
              m.marks.push({ x1: C[m.pbIdx].startBar, x2: b.endBar + o.extend, y: m.pbLevel,
                             color: bull ? m.def.bull : m.def.bear, style: "dotted", width: m.def.width });
              if (m.marks.length > o.cisdMax) m.marks.shift();
              m.count += 1;
              for (const s of props) { s.prop.add(m.sec); s.endBar = Math.max(s.endBar, b.endBar); }
            }
          }
        }
        return;
      }
      m.pbArmed = false;

      if (up) {
        const setups = setupsFor(m, b.endBar, C[m.levelIdx].startBar);
        if (setups.length) {
          m.marks.push({ x1: C[m.levelIdx].startBar, x2: b.endBar + o.extend, y: m.level,
                         color: bull ? m.def.bull : m.def.bear, style: "solid", width: m.def.width });
          if (m.marks.length > o.cisdMax) m.marks.shift();
          m.count += 1;
          for (const s of setups) { s.done.add(m.sec); s.endBar = Math.max(s.endBar, b.endBar); }
        }
      }
      m.bias = up ? 1 : -1;
      [m.level, m.levelIdx] = scanRun(C, j, m.bias, true);
      m.extreme = m.bias === 1 ? b.h : b.l;
    }

    // ── Bar loop ───────────────────────────────────────────
    for (let i = 0; i <= lastBar; i++) {
      const b = bars[i];
      // 1. Correlated assets up to the end of this chart bar.
      const endT = b.t + o.chartSec;
      others.forEach((arr, a) => {
        while (ptr[a] < arr.length && arr[ptr[a]].t < endT) {
          const ob = arr[ptr[a]++];
          for (const tr of ctxT) feedOther(tr.oth[a], ob, tr.sec);
          for (const tr of intT) feedOther(tr.oth[a], ob, tr.sec);
        }
      });
      // 2. CISD candles that ended on the previous bar, judged against the setups as they stood then.
      if (o.cisd) for (const m of runnable) if (m.cur && bucket(b.t, m.sec) !== m.cur.bucket) completeCandle(m);
      // 3. Swing points, context first.
      for (const tr of ctxT) update(tr, i);
      for (const tr of intT) update(tr, i);
      if (ctxActive()) for (const t of intT) for (const s of (t.current ? [t.current] : []).concat(t.live)) {
        if (fitsContext(s)) s.ctxOk = true;
      }
      // 4. This bar joins the forming CISD candles.
      if (o.cisd) for (const m of runnable) {
        if (!m.cur) m.cur = { bucket: bucket(b.t, m.sec), o: b.o, h: b.h, l: b.l, c: b.c, startBar: i, endBar: i };
        else { m.cur.h = Math.max(m.cur.h, b.h); m.cur.l = Math.min(m.cur.l, b.l); m.cur.c = b.c; m.cur.endBar = i; }
      }
    }

    // ── Drawings (no labels) ───────────────────────────────
    // Style: solid = C2 closed back inside C1, dashed = C2 closed below and C3 reclaimed C2's open, dotted = SMT low.
    const styleOf = (s) => (s.kind === "smt" ? "dotted" : s.type === 2 ? "dashed" : "solid");
    const swingLines = new Map();
    const addSwing = (t, s) => {
      const key = s.lowBar + "|" + s.low;
      const prev = swingLines.get(key);
      if (!prev) swingLines.set(key, { x1: s.lowBar, x2: s.endBar, y: s.low, color: t.def.color, style: styleOf(s), width: t.isCtx ? 2 : 1, sec: t.sec });
      else {
        prev.x2 = Math.max(prev.x2, s.endBar);
        if (t.sec > prev.sec) Object.assign(prev, { sec: t.sec, color: t.def.color, style: styleOf(s), width: t.isCtx ? 2 : 1 });
      }
    };
    if (o.showCtx) for (const t of ctxT) for (const s of t.drawn) if (!s.failed) addSwing(t, s);
    for (const t of intT) for (const s of t.drawn) if (!s.failed && s.ctxOk) addSwing(t, s);

    const lines = [...swingLines.values()];
    if (o.showCtx) for (const t of ctxT) lines.push(...t.contLines);
    for (const m of runnable) lines.push(...m.marks);

    if (o.cisd && o.pending) {
      for (const m of runnable) {
        if (m.bias === -1 && m.levelIdx !== null && setupsFor(m, lastBar, m.candles[m.levelIdx].startBar).length) {
          lines.push({ x1: m.candles[m.levelIdx].startBar, x2: lastBar, y: m.level, color: bull ? m.def.bull : m.def.bear, style: "dashed", width: m.def.width });
        }
      }
    }

    // Phase of each timeframe at the last bar, for the status table.
    const phase = (t) => {
      const s = t.current || t.live.find((x) => !x.c3Settled);
      if (!s) return null;
      const kind = s.kind === "smt" ? "SMT" : s.phase === "C3" && s.type === 2 ? "type 2" : "";
      return (s.phase === "C2" ? "C2" : "C3") + (bull ? "▲" : "▼") + (kind ? " " + kind : "") + (t.isCtx || s.ctxOk ? "" : " (no context)");
    };
    const phaseWithCont = (t) => {
      const p = phase(t);
      const c = t.contLeft > 0 ? "continuation" + (bull ? "▲" : "▼") : null;
      return p && c ? p + " · " + c : p || c;
    };
    const phases = {};
    for (const t of ctxT.concat(intT)) phases[t.def.name] = phaseWithCont(t);
    const cisdState = machines.map((m) => m.def.name + ": " + (m.ok ? "on" : "can't build from " + tfName(o.chartSec) + " candles"));
    const entries = runnable.reduce((a, m) => a + m.count, 0);
    return { lines, phases, cisdState, context: ctxActive(), entries };
  }

  // bars: chart candles [{t,o,h,l,c}]; others: [[{t,o,h,l,c}] 1m candles of correlated assets].
  function run(bars, others, o) {
    const lines = [];
    const status = { phases: {}, cisd: [], context: [], entries: 0 };
    const sides = [];
    if (o.bull) sides.push([runSide(bars, others, o, true), 1]);
    if (o.bear) sides.push([runSide(mirror(bars), others.map(mirror), o, false), -1]);
    for (const [r, sign] of sides) {
      for (const ln of r.lines) lines.push(Object.assign({}, ln, { y: ln.y * sign }));
      for (const [k, v] of Object.entries(r.phases)) if (v) status.phases[k] = (status.phases[k] ? status.phases[k] + ", " : "") + v;
      status.cisd = r.cisdState;
      if (r.context) status.context.push(sign === 1 ? "bullish" : "bearish");
      status.entries += r.entries;
    }
    status.lines = lines.length;
    return { lines, status };
  }

  global.PreviewEngine = { CTX_TFS, INT_TFS, CISD_TFS, tfName, run };
})(window);
