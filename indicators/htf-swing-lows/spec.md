# HTF Swing Points + CISD

## Purpose
Marks only the entries the user's swing point model allows: a higher-timeframe swing point gives the context,
a smaller-timeframe swing point inside it is the setup, and a valid CISD on the paired timeframe is the entry.
Sweeps and CISDs outside that chain are not drawn. Model explained in sample_videos/Video-002.mov and Video-003.mov
and Video_004.mov (see the trading-model memory). Version 1.0.0 replaced the v0.x "every swept low + CISD" logic;
1.1.0 adds the continuation context, the propulsion block and an optional Weekly context.

## Swing points (C1, C2, C3)
Bullish, on any timeframe (bearish is the exact mirror: highs instead of lows):
- **Type 1**: C2 takes C1's low and closes back inside C1. Solid line.
- **Type 2**: C2 takes C1's low and closes below it; it only stands if C3 then closes above C2's open. Dashed line.
- **SMT**: C2 does not take C1's low, but a correlated index takes its own previous low in the same candle. Dotted line.
  Correlated indices: NQ <-> ES + YM, ES <-> NQ + YM, YM <-> NQ + ES (micros map to micros), or symbols the user types.
The line sits at C1's low, from where it was made through C3. Candles follow TradingView's own boundaries
(futures day from 18:00 New York; 4H at 18, 22, 02, 06, 10, 14).

## Top-down chain
1. **Context** (Weekly off by default, Daily, 4H), in the same direction, either:
   - **C2 context**: forming a C2 or in the C3 after one (real or SMT low). Option: only SMT lows count.
   - **Continuation context** (1.1.0, Video_004): the candle after an expansion candle, i.e. one that closed through the
     previous candle's extreme (bearish: a close below the previous low = a failure to manipulate it). Setups count if they
     form after the expansion candle closed and their low holds its upper half (bearish: their high stays in its lower half).
     The expansion candle's half is drawn as a dotted line in the context colour.
2. **Setups**: 1H / 30m / 15m C2s formed while the context is active.
   Option (default on, "fractal"): in a C2 context the setup's C2 low must be the same price as the context C2's low.
   A setup stays open for its C2 and C3 (+ N extra candles, default 0). Type 2 setups fail if C3 doesn't close above C2's open.
3. **Entry**: the first valid CISD per setup on the paired timeframe: 1H -> 5m, 30m -> 3m, 15m -> 1m and 3m.
   Valid = the run of down-close candles it closes above started inside the setup's C2 candle or later, and the CISD
   triggers after the setup started. The setup's line is extended to the CISD.
   CISD candles are built from chart candles, so a CISD timeframe only runs when it is a multiple of the chart timeframe
   (1m chart: 1m, 3m, 5m; 3m chart: 3m; 5m chart: 5m).
   Pending: while a setup is open and the CISD hasn't triggered, the level is drawn dashed to the current bar.
4. **Propulsion block** (1.1.0): after a setup's first CISD on a timeframe, the next pullback run of opposite candles
   (its extreme open) that price closes through again. Second entry, drawn dotted in the CISD colour, once per setup per
   timeframe.

## CISD state machine (per CISD timeframe, per direction)
While the leg is bearish, the level is the highest open of the latest run of bearish candles (dojis skipped) that made the
newest low; a close above it is a bullish CISD, the leg flips, and the level is taken from the bullish run. Mirror for bearish.

## Inputs
| Group | Input | Default |
|---|---|---|
| Context | Weekly, Daily, 4H | off, on, on |
| Context | Continuation after an expansion candle | on |
| Context | SMT lows count; SMT symbols (empty = automatic) | on |
| Context | Only SMT lows | off |
| Context | Setup low must be the context C2's low (fractal) | on |
| Setups | 1H + CISD 5m; 30m + CISD 3m; 15m + CISD 1m / 3m | all on |
| Setups | Extra candles after C3 | 0 |
| Show | Only the current 4H candle | on |
| Show | Bullish, bearish; context lines; CISD; propulsion block; pending | all on |
| Show | Swings kept per timeframe / CISD kept per timeframe | 20 / 30 |
| Show | Swing line overshoot / CISD extend (bars) | 2 / 0 |
| Sequence table | Show, position, size; sequence timeframe (4H / Daily); direction (Auto / Bullish / Bearish); time zone | on, middle right, small, 4H, Auto, New York |
| Candle panel | Show, candles (4), three timeframes (15m, 1H, 4H), distance, width, colours | on |
| Chart context | Current 4H box (C2 / C3 colours), previous day levels, text tags | all on |
| Colours | Weekly, Daily, 4H, 1H, 30m, 15m; CISD ▲ and ▼ per 1m / 3m / 5m | |

## Display (1.2.0, Video_005)
The user trades inside the current 4H candle, so by default ("Only the current 4H candle", on) only that candle's
entries are drawn: setup lines, CISD and propulsion lines whose trigger is in the current 4H candle, plus context and
setups whose window is still open and the pending level. Everything older is removed when a new 4H candle starts.
The analysis itself still runs over the whole history.

## Sequence table, candle panel and chart context (1.3.0)
Layout modelled on a screenshot the user shared on 2026-10-20 (a "Fractal PO3 Seq" chart).

**Sequence table** (3 columns, middle right by default), for one direction: "Auto" picks the side whose sequence is
further along (C3 = 3, C2 or continuation = 2, C4 = 1), plus 1 if the next higher context timeframe is in line and 1 if
it has an entry in the current 4H candle. The higher score wins; on a tie the more recent entry wins; 0 : 0 is NEUTRAL.
- **Header**: symbol · sequence timeframe (4H by default, or Daily) · chart timeframe.
- **BIAS** and the sequence timeframe's live candle: C2 (forming), C3 (after a valid C2), C4 (the candle after that C3),
  CONT (continuation candle after an expansion candle) or – (none).
- **STRENGTH** (as in 1.2.0) and **CHAIN** (the alignment chain of 1.2.0).
- **C2 QUALITY** of the sequence C2, with C1/C2 open times, graded by the share of applicable checks passed
  (≥ 80 % STRONG, ≥ 50 % GOOD, else WEAK). Checks (yes / no / wait / n/a):
  1. C2 closed back inside C1 (type 1), or C3 closed past C2's open (type 2), or C2 held C1's low by SMT.
  2. SMT on C2: a correlated index took its low and this one held (SMT C2), or this one took it and a correlated index held.
  3. A CISD on 1m / 3m / 5m in the side's direction while C2 was forming (n/a without a CISD timeframe).
  4. C2 low in discount (below the previous day's equilibrium, PD-EQ); bearish: C2 high in premium.
  5. The next higher context timeframe (Daily for a 4H sequence) has an aligned C2 / C3 / continuation.
  6. Displacement: a fair value gap on the chart timeframe (bullish: low > high two bars back) after the C2 low.
- **SETUP LANES** for each setup timeframe (A = 1H ▸ 5m, B = 30m ▸ 3m, C = 15m ▸ 1m/3m): the latest aligned setup
  that is open or belongs to the current 4H candle. Sweep row: C1's open time (and SMT partner), DONE once C2 closed,
  C2 NOW while it forms. Entry row: open time of the first CISD candle (+ propulsion block time), DONE, PENDING while
  the setup's window is open, MISSED after.
- **EXECUTION**: ENTRY with the lanes that entered in this 4H candle and the C2 grade, else WAIT (CISD pending),
  WAIT · NO SETUP, or NO SEQUENCE; then a progress bar of sweep + entry steps done over all lanes.
- **Footer**: SMT symbols and CISD timeframes.

**Candle panel** (right of price, on by default): the last 4 candles of three timeframes (15m, 1H, 4H by default; any
timeframe above the chart's), built from chart bars plus the unclosed bar. Under each candle its open time, and C1 / C2 /
C3 / C4 around the newest C2 in the table's direction (same swing point rules, SMT included); a dashed line marks C1's
low swept by C2. Above each group: the timeframe and a countdown to its close.

**Chart context**: the current 4H candle shaded from its open to its expected close (grey while it is a C2, blue while it is a
C3, with the C2 before it shaded grey); the previous day's high, low and equilibrium (PDH / PDL / PD-EQ) from the day's
open; text tags at the end of this 4H candle's lines ("30m SMT YM", "3m CISD", "3m PB" = propulsion block,
"3m level" = pending). Tags can be turned off for price lines without text (the candle panel and PDH / PDL / PD-EQ keep theirs).

## Outputs
Lines, plus the text listed above (tags, candle panel). The dotted half lines follow the "Context swing lines" toggle (hiding them changes nothing else).
Up to 1.2.0 the status table (bottom right) had:
- **Chart**: symbol, timeframe, whether only the current 4H candle is drawn.
- **Strength**: NQ / ES / YM ranked by % move from the trading day's open (18:00 New York), strongest first,
  e.g. `NQ +0.42% > ES +0.30% > YM -0.10%`. Buy the strongest, sell the weakest.
- **▲ / ▼ Alignment**: the chain for this chart's symbol, highest timeframe first, then the latest entry in the current
  4H candle (or a pending CISD), e.g. `1D(C2) → 4H(C3) → 30m(C2 SMT YM) → 3m CISD`.
  `SMT YM` marks a C2/C3 formed by SMT (YM took the level, this symbol did not); `continuation` marks the candle after
  an expansion candle.
- **CISD on**: CISD timeframes that can run on this chart. **SMT vs**: the correlated symbols.
500-line budget shared by everything.

## Alerts
None yet.

## Repainting
Does not repaint: all logic runs on confirmed chart bars. Correlated indices are requested on the chart timeframe,
so no higher-timeframe lookahead is involved.

## Browser preview
preview/engine.js implements the same rules for quick visual checks on NQ / ES / YM sample data. TradingView is the source of truth.

## Not yet included (from Video-003, waiting for definitions)
Dealing-range premium/discount, failure vs relevant swings as targets, SMT agreeing with the daily,
CISD quality (weak candles), fair value gaps (strength / entries), choosing the asset by position vs the daily open.

## Acceptance checks
- 1.3.0: the sequence table fills every row; the candle panel shows 15m / 1H / 4H to the right with times, C-tags and
  countdowns; the 4H box turns blue in a C3; PDH / PDL / PD-EQ start at the day's open; "Text tags" off removes the tags.
- Status table: Strength ranks three indices; ▲/▼ Alignment chains end with the current 4H entry or a pending CISD;
  on a 3m chart "CISD on: 3m", on 1m "1m, 3m, 5m".
- Only CISD/propulsion lines from the current 4H candle are on the chart; turning the option off shows the history.
- NQ 13 Oct 2026 ~08:30-09:00 New York (Video_005): ▼ chain should read like 1D(C2) → ... → 30m(C2 SMT YM) → 3m CISD.
- With "Text tags" off, no text on swing or CISD lines; one line per swept low (a low shared by 15m and 30m is drawn once, in the 30m colour).
- Every green CISD line has an open 15m / 30m / 1H setup line just before it, inside an active Daily/4H context.
- YM 15 Oct 2026 around 10:00 New York on 3m: the 30m 9:30 setup and the 3m CISD from Video-002 should appear.
- Turning off "fractal" adds entries; turning on "Only SMT lows" removes most.
- Bar Replay: lines never change after the bar closes.
- NQ 12 Oct 2026 around 12:00 New York (Video_004): bearish 3m CISD around 12:12 and its dotted propulsion block around
  12:21 on a 3m chart; 5m CISD around 12:05 and propulsion around 12:20 on a 5m chart (preview measurements).
- Measured in the preview (30 days, both directions, default filters): NQ 3m about 15 entries a day without continuation,
  about 25 with it; propulsion blocks are about a third of all entries.
