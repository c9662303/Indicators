# HTF Swing Lows + CISD

## Purpose
Draws horizontal lines on the chart at the lows of higher-timeframe (HTF) candles that were "swept with rejection",
so the trader sees liquidity levels from 15m / 30m / 1h / 4h without drawing any HTF candles.
Swing definition adapted from the sample `samples/TLM-HTF.pine` (lines ~749-750, 1189-1191).

## Logic
HTF candles are built from the chart's own bars, with boundaries from `timeframe.change(htf)`. No `request.security`.
For each HTF, take two consecutive HTF candles, A (earlier) and B (next):

- **Potential swing low**: B is still forming and B.low < A.low (A's low has been swept). Line is dashed.
- **Confirmed swing low**: B has closed, B.low < A.low and B.close > A.low (swept and rejected). Line is solid.
- If B closes at or below A.low there is no rejection, so the line is deleted.

Line geometry:
- y = A.low
- starts at the chart bar where A's low was made
- ends at B's last chart bar + overshoot bars (while B is forming, at the current bar + overshoot)
- optional small text label at the right end with the HTF name

Only the last N confirmed lines per HTF are kept (older ones are deleted), plus the current potential line.

## Choosing the timeframes (adapted from the sample's matrix)
**HTF slots 1-6**: each has a checkbox, a timeframe and a line colour.
Defaults (v0.7.0): 1 = 5m, 2 = 15m, 3 = 30m, 4 = 1h, 5 = 4h (on); 6 = 1D (off).

**Show on chart timeframe**: seven rows. Each row has an on/off box, a chart timeframe, and boxes 1-6 (one per HTF slot).
- If the chart timeframe equals the timeframe of an enabled row, that row decides which slots are drawn
  and the slot checkboxes are ignored (a slot ticked in the row shows even if its own checkbox is off).
- If no enabled row matches, the slot checkboxes decide.
- A slot is only ever drawn when its timeframe is higher than the chart timeframe.

Default rows:
| Row | Chart | Slots drawn |
|---|---|---|
| 1 | 30s | 1 (5m), 2 (15m) |
| 2, 3 | 1m, 3m | 2 (15m), 3 (30m) |
| 4 | 5m | 4 (1h) |
| 5, 6, 7 | 15m, 30m, 1h | 5 (4h) |

Chart timeframes with no row (e.g. 2m, 10m, 4h) use the slot checkboxes, so they show every enabled HTF above them.

## Inputs
| Group | Input | Default | Meaning |
|---|---|---|---|
| Higher timeframes | HTF 1-6: checkbox, timeframe, colour | see above | |
| Show on chart timeframe | 7 rows of: on, chart timeframe, boxes 1-6 | see above | |
| Which sweeps | Confirmed | on | Swept and the HTF candle closed back above. Solid |
| Which sweeps | Potential | on | Swept and the HTF candle is still open. Dashed. Removed if it closes below the low |
| Style | Line width, confirmed style, potential style | 1, Solid, Dashed | |
| Style | Overshoot (bars) | 2 | Bars the line extends past the sweeping candle |
| Style | Show labels | on | HTF name at the line end |
| Style | Confirmed lines kept per timeframe | 50 | Older ones are deleted (was 5 before v0.8.0) |

## CISD (chart timeframe)
Adapted from `samples/Cisd.pine`. Re-implemented, same behaviour. Always uses the chart's own candles; no HTF, no table.

State: `bias` (bullish/bearish), `level` (price), `levelBar` (where the level's open was printed), `extreme`.
- **Level**: for a bullish bias, the lowest open of the latest run of consecutive bullish candles (dojis skipped);
  for a bearish bias, the highest open of the latest run of bearish candles.
- **Start**: first candle with a direction (after bar 10) sets the bias; the level comes from the run including that candle.
- **New extreme** (bullish: new highest high; bearish: new lowest low): the level moves to the latest run of
  bias-direction candles. If the current candle points the same way as the bias, the run includes the current candle,
  otherwise only the run before it.
- **Trigger**: bias bearish and close > level = bullish CISD (+CISD). Bias bullish and close < level = bearish CISD (-CISD).
  A line is drawn at the level from `levelBar` to the trigger bar (+ extend). Then the bias flips and a new level is taken
  from the run that includes the trigger bar.

### Only the CISD out of the current HTF swing low (v0.4.0)
Without a gate every CISD on the chart is drawn. With "Only CISD out of an HTF swing low" on (default):
- **Armed**: an active HTF slot becomes armed whenever its forming candle trades below the previous HTF candle's low
  (the same sweep that draws the swing low line). Armed lasts for the sweeping candle plus N more HTF candles
  (input "HTF candles to wait after the sweep", default 1).
- The armed state ends early if the sweeping candle closes below the swept low (no rejection).
  Every bullish CISD inside the window is drawn (v0.8.0; earlier text promised one per swing, which the code never did).
- **Drawn**: a bullish CISD is drawn only while at least one HTF is armed. The label names every armed timeframe,
  e.g. `+CISD 5m 15m` (v0.8.0; before it named only the highest). Other CISDs are not drawn; bearish CISDs are hidden until HTF swing highs exist.
- **Pending**: while armed and the bias is bearish, the current CISD level is shown as a dashed line extended to the
  current bar (`+CISD 30m (pending)`). It is replaced by the solid line when price closes above it, and removed if the
  swing stops counting.
- The CISD state machine itself (bias, level, flips) still runs on every bar; gating only decides what is drawn.
- **Swing low with the CISD (v0.5.0)**: every pending and triggered CISD is drawn together with the HTF low it came out of:
  a solid line in that HTF's colour at each armed swept low, from the bar where the low was made to the CISD's end,
  labelled e.g. `5m low`, `15m low`. It is independent of the swing line settings, so the pair is visible even with swing lines turned off.
  Input "Show the swing low the CISD comes from" (on).

Inputs: show on/off, filter (Both / Bullish Only / Bearish Only), max lines kept (50), extend bars (0),
line style and width, bullish/bearish colours, label on/off, position and size.
The filter only hides lines; the bias still flips on hidden triggers.
Not included from the sample: active-level plot, debug plot, multi-timeframe trend table, alerts.

## Outputs
Lines and optional labels (no plots), plus a status table at the bottom right (v0.6.0, can be turned off):
chart timeframe, matched settings row, active HTFs, swing low currently being come out of, CISD bias.

## Alerts
None in this version.

## Repainting
Does not repaint. All logic runs only when a chart bar is confirmed (closed), so nothing changes after the fact.
Consequence: on the live bar, a potential (dashed) line appears when that chart bar closes, not tick by tick.

## Acceptance checks
- With default settings: 3m chart shows only 15m and 30m lines, 5m only 1h, 1h only 4h.
- Untick HTF 2 and a row's box 2 separately to confirm that a matching row overrides the slot checkbox, and that
  an unmatched chart timeframe (e.g. 2m) follows the slot checkboxes.
- CISD: compare a few +CISD / -CISD lines against the original "CISD by tncylyv" on the same symbol and timeframe.
  Lines should start and end on the same bars. Set Filter to "Bullish Only" and confirm that bearish ones disappear.
- Turn off Confirmed: only dashed lines remain. Turn off Potential: lines appear only once the HTF candle closes.
- A solid line sits exactly at an HTF candle's low, and the next HTF candle (check with the 15m/1h chart) has a lower low
  and closes above that level. The line ends just after that candle.
- A dashed line appears only while the current HTF candle has traded below the previous HTF candle's low.
- If the next HTF candle swept the low and closed below it, no line exists for that candle.
- Bar Replay through a day: lines that were drawn earlier do not move or disappear, except potential lines that
  either become solid or are removed when their HTF candle closes.
