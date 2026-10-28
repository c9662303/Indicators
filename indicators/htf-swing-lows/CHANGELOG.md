# Changelog

## 1.3.0 — 2026-10-20
Layout modelled on the user's "Fractal PO3 Seq" screenshot.
- Sequence table replaces the status table: bias (auto or fixed), live 4H (or Daily) candle C2 / C3 / C4 / CONT,
  strength, alignment chain, C2 quality (6 checks: close vs C1, SMT, LTF CISD inside C2, discount / premium vs PD-EQ,
  higher timeframe in line, displacement FVG) with a STRONG / GOOD / WEAK grade, setup lanes (1H ▸ 5m, 30m ▸ 3m,
  15m ▸ 1m/3m) with sweep and entry times and DONE / PENDING / MISSED, execution row and progress bar.
- Candle panel right of price: last 4 candles of 15m / 1H / 4H (configurable) with open times, C1-C4 tags, C1's swept
  level and a countdown to each candle's close.
- Chart context: current 4H candle box (grey C2, blue C3 + its C2), previous day high / low / equilibrium, text tags on
  this 4H candle's swing and CISD lines (toggle; off = no text on price lines).
- Setups now record C1/C2 open times, the first CISD and propulsion times, SMT "held" partners and LTF CISDs inside a
  context C2. Signals and lines are unchanged.

## 1.2.0 — 2026-10-16
- "Only the current 4H candle" (on): only the current 4H candle's entries are drawn, plus open context/setups; older
  drawings are removed at each new 4H candle. Analysis still uses all history (Video_005).
- Status table rebuilt: strength ranking of NQ / ES / YM by % from the day's open, and ▲ / ▼ alignment chains such as
  "1D(C2) → 4H(C3) → 30m(C2 SMT YM) → 3m CISD", with SMT C2/C3s marked with the index that took the level.
- SMT setups remember which correlated index took the level.
- Strength ranking works with "SMT lows count" off too (the correlated indices are always loaded).

## 1.1.0 — 2026-10-16
- Continuation context (Video_004): the candle after a Daily/4H/Weekly expansion candle (closed through the previous
  candle's extreme, e.g. a failure to manipulate a low) is a context; setups must hold the expansion candle's near half.
  Its half line is drawn dotted. Input "Continuation after an expansion candle" (on).
- Propulsion block: the next pullback run after a setup's first CISD, closed through again; dotted second entry.
  Input "Propulsion block" (on).
- Optional Weekly context (off by default); status table has a Weekly row.
- Preview engine updated to the same rules.

## 1.0.1 — 2026-10-16
- Fix TradingView compile messages: shorttitle shortened to "Swing Pts" (max 10 characters);
  ctxUsable is now a method on Setup (its first argument was unused, CE10236).

## 1.0.0 — 2026-10-16
- Rewritten as the swing point model (same rules as the browser preview): Daily/4H context, 1H/30m/15m setups,
  first valid CISD on the paired timeframe (1H -> 5m, 30m -> 3m, 15m -> 1m + 3m).
- Swing types: type 1 (solid), type 2 (dashed), SMT low (dotted) with ES/YM/NQ auto-paired.
- Both directions (bearish = mirrored logic). No labels. One line per swept low.
- Removed: HTF slot matrix, labels, chart-timeframe CISD, "swing low the CISD comes from" lines.
- Renamed to "HTF Swing Points + CISD". Old settings do not carry over; reset to defaults after pasting.

## 0.8.0 — 2026-10-16
- Swing lines kept per timeframe: default 5 -> 50 (max 100). With 5, lines disappeared when scrolling back,
  which is why swing lows seemed missing while their CISDs were still visible.
- CISD label and swing-low lines now cover every HTF price is coming out of (e.g. "+CISD 5m 15m"), not only the highest.
- Removed the "one CISD per swing" reset: it was undone on the next bar anyway, so behaviour is now stated plainly:
  every bullish CISD inside the window is drawn.

## 0.7.0 — 2026-10-16
- Default HTF slots are now 5m, 15m, 30m, 1h, 4h, 1D (5m added, 1W dropped); slot numbers shifted by one.
- Seventh "Show on chart timeframe" row; new default row 30s chart -> 5m + 15m swing lows.
- Existing rows renumbered to the new slots (1m/3m -> 15m + 30m, 5m -> 1h, 15m/30m/1h -> 4h).
- Settings saved in TradingView from older versions will not line up: reset the indicator settings to defaults.

## 0.6.0 — 2026-10-16
- Status table (bottom right, input "Show status table"): matched settings row, active HTFs, swing low being
  come out of, CISD bias. Added to diagnose "nothing shows on 30s / 5m / 15m".

## 0.5.0 — 2026-10-16
- Each pending and triggered CISD now draws the HTF swing low it came out of (e.g. "15m low"), in the HTF colour,
  from the low to the CISD. New input "Show the swing low the CISD comes from".

## 0.4.0 — 2026-10-16
- CISD is now tied to the HTF swing low: only the CISD out of the swing price is currently leaving is drawn
  (new inputs: gate, HTF candles to wait, show pending level). Label names the HTF.
- Turn the gate off to get every CISD as in 0.3.0.

## 0.3.0 — 2026-10-16
- Added CISD lines on the chart timeframe, adapted from samples/Cisd.pine (lines, labels, filter, max kept, extend, style).
- Renamed to "HTF Swing Lows + CISD".
- Added max_bars_back = 500 (CISD looks back up to 500 bars).

## 0.2.0 — 2026-10-16
- Six configurable HTF slots (checkbox, timeframe, colour) replace the fixed 15m/30m/1h/4h.
- Per-chart-timeframe visibility matrix (six rows, boxes 1-6) replaces the automatic mapping.
- New "Which sweeps" toggles: confirmed and potential.

## 0.1.0 — 2026-10-16
- Initial version: swing low lines for 15m / 30m / 1h / 4h, selected by chart timeframe.
- Adapted swing definition from samples/TLM-HTF.pine.
