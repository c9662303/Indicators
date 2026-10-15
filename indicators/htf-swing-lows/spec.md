# HTF Swing Lows

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
Defaults: 1 = 15m, 2 = 30m, 3 = 1h, 4 = 4h (on); 5 = 1D, 6 = 1W (off).

**Show on chart timeframe**: six rows. Each row has an on/off box, a chart timeframe, and boxes 1-6 (one per HTF slot).
- If the chart timeframe equals the timeframe of an enabled row, that row decides which slots are drawn
  and the slot checkboxes are ignored (a slot ticked in the row shows even if its own checkbox is off).
- If no enabled row matches, the slot checkboxes decide.
- A slot is only ever drawn when its timeframe is higher than the chart timeframe.

Default rows (these reproduce the original request):
| Chart | Slots drawn |
|---|---|
| 1m, 3m | 1 (15m), 2 (30m) |
| 5m | 3 (1h) |
| 15m, 30m, 1h | 4 (4h) |

Chart timeframes with no row (e.g. 2m, 10m, 4h) use the slot checkboxes, so they show every enabled HTF above them.
Rows 4-6 are a guess for 15m and above; edit the rows or timeframes freely.

## Inputs
| Group | Input | Default | Meaning |
|---|---|---|---|
| Higher timeframes | HTF 1-6: checkbox, timeframe, colour | see above | |
| Show on chart timeframe | 6 rows of: on, chart timeframe, boxes 1-6 | see above | |
| Which sweeps | Confirmed | on | Swept and the HTF candle closed back above. Solid |
| Which sweeps | Potential | on | Swept and the HTF candle is still open. Dashed. Removed if it closes below the low |
| Style | Line width, confirmed style, potential style | 1, Solid, Dashed | |
| Style | Overshoot (bars) | 2 | Bars the line extends past the sweeping candle |
| Style | Show labels | on | HTF name at the line end |
| Style | Confirmed lines kept per timeframe | 5 | Older ones are deleted |

## Outputs
Lines and optional labels only (no plots).

## Alerts
None in this version.

## Repainting
Does not repaint. All logic runs only when a chart bar is confirmed (closed), so nothing changes after the fact.
Consequence: on the live bar, a potential (dashed) line appears when that chart bar closes, not tick by tick.

## Acceptance checks
- With default settings: 3m chart shows only 15m and 30m lines, 5m only 1h, 1h only 4h.
- Untick HTF 2 and a row's box 2 separately to confirm that a matching row overrides the slot checkbox, and that
  an unmatched chart timeframe (e.g. 2m) follows the slot checkboxes.
- Turn off Confirmed: only dashed lines remain. Turn off Potential: lines appear only once the HTF candle closes.
- A solid line sits exactly at an HTF candle's low, and the next HTF candle (check with the 15m/1h chart) has a lower low
  and closes above that level. The line ends just after that candle.
- A dashed line appears only while the current HTF candle has traded below the previous HTF candle's low.
- If the next HTF candle swept the low and closed below it, no line exists for that candle.
- Bar Replay through a day: lines that were drawn earlier do not move or disappear, except potential lines that
  either become solid or are removed when their HTF candle closes.
