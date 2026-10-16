# Changelog

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
