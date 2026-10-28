---
name: pine-script
description: Pine Script v6 reference for writing, editing or reviewing TradingView indicators. Covers v6 syntax changes, the execution model, repainting, platform limits, alerts, drawings and code style. Use whenever reading or writing a .pine file or discussing TradingView indicator logic.
---

# Pine Script v6 rules

## Script skeleton

Every indicator follows this order (see `../new-indicator/template.pine`):

1. Header comment: name, version, one-line description
2. `//@version=6` then `indicator(...)`
3. Constants (`SNAKE_CASE`)
4. Inputs, grouped with `group=` and explained with `tooltip=`
5. Calculations (pure logic, no plotting)
6. Plots, fills, background colours
7. Drawings and tables (labels, lines, boxes)
8. Alerts

## Execution model

- The script runs once per historical bar, left to right, then on **every tick** of the realtime bar.
- A plain variable is re-initialised on every bar. `var x = 0` initialises once and keeps its value across bars.
  `varip` also keeps its value across ticks within the realtime bar (rarely needed).
- `close[1]` is the previous bar's value. Referencing far back can raise a max_bars_back error;
  fix it with `max_bars_back(series, n)` or the `max_bars_back` parameter of `indicator()`.
- On the realtime bar, `close` changes tick by tick. Signals based on it can appear and then vanish
  until the bar closes. Use `barstate.isconfirmed` to act only on closed bars.

## v6 changes that break v5 habits

- `bool` values can never be `na`. Initialise bools with `true` or `false`; `na(myBool)` is a compile error.
- Numbers are not implicitly converted to bool. Write `if volume > 0`, not `if volume`.
- `and` / `or` short-circuit: the right side may not run. Do not put `ta.*` calls on the right side of `and`/`or`.
- Dividing two integer constants can give a fractional result. If you need integer division, wrap it in `int()` or `math.floor()`.
- `timeframe.period` always includes the multiplier (`"1D"`, not `"D"`).
- The `transp` parameter is removed. Use `color.new(color.red, 70)`.
- `request.security()` can be called inside loops and conditionals (dynamic requests are on by default).
- Strategies: the `when` parameter is removed; wrap calls in `if` instead.

## Compiler checks that are easy to miss

These have all been hit in this project. TradingView rejects or flags them even though the logic is fine.

- `shorttitle` in `indicator()` / `strategy()` must be **10 characters or fewer** (SHORT_TITLE_TOO_LONG).
  Count spaces and symbols too. Pick it when writing the header, e.g. `"Swing Pts"`, not `"Swing Points"`.
- A `method` must **use its first argument** (CE10236). If the body only uses the other arguments, either make it
  a plain function or turn it into a method on the type it actually works on
  (e.g. `method ctxUsable(Setup s)` called as `s.ctxUsable()`, not `method ctxUsable(Side sd, Setup s)`).
- `bool` fields in a `type` need a default (`bool done = false`); a bool can never be `na`.
- Assign nested fields through a local reference: `Setup cur = t.current` then `cur.endBar := x`,
  rather than `t.current.endBar := x`.
- When a wrapped condition continues on the next line, end the first line with the operator (`... and`),
  not start the next line with it.

## Series consistency

- `ta.*` functions that keep internal history (`ta.sma`, `ta.ema`, `ta.rsi`, `ta.crossover`, ...) must run on
  **every bar**. Never call them only inside an `if`, a ternary branch, a loop or after `and`/`or`.
  Compute them into a global variable first, then use the variable in conditions.
- Length arguments of most `ta.*` functions must be `simple int`: fixed when the script starts, not changing per bar.
  An `input.int()` works; a value computed from price does not.
- `x == na` is always false. Use `na(x)`. Use `nz(x, fallback)` to replace na.

## Repainting (the most important rule)

An indicator "repaints" when its past signals change after the fact. Users trust what they see in history,
so repainting makes backtests and visual checks misleading. Default to **non-repainting** unless the spec says otherwise.

Common causes and fixes:

| Cause | Fix |
|---|---|
| Higher-timeframe data via `request.security()` with default settings | `request.security(syminfo.tickerid, tf, expr[1], lookahead = barmerge.lookahead_on)` — the `[1]` plus lookahead gives the last *closed* HTF value |
| `lookahead = barmerge.lookahead_on` **without** `[1]` | Future data leaks into history. Never do this. |
| Signals on the unclosed realtime bar | Gate signals and `alert()` with `barstate.isconfirmed` |
| Pivots (`ta.pivothigh/low`) | They confirm `rightBars` bars late. Plot them with `offset = -rightBars` and say clearly in the spec that they are delayed |
| `varip` or tick-based logic | Avoid unless explicitly required |

When the spec allows repainting, add a tooltip or comment saying so.

## Platform limits

- Up to 64 plot counts per script (each `plot`, `plotshape`, `bgcolor`, `fill`, etc. uses one or more).
- Labels, lines and boxes: 50 each by default, up to 500 via `max_labels_count`, `max_lines_count` and `max_boxes_count` in `indicator()`.
  When over the limit, the oldest objects are silently deleted.
- `request.*` calls are capped (about 40 unique calls; varies by plan). Combine requests with tuples: `[o, c] = request.security(..., [open, close])`.
- Loops have an execution time limit. Avoid nested loops over long lookbacks on every bar.
- Arrays and matrices: max 100,000 elements.

## Plots and visuals

- `plot()`, `plotshape()`, `bgcolor()`, `fill()`, `hline()` and `alertcondition()` must be at global scope.
  To show something conditionally, pass `na`: `plot(showMa ? ma : na)`.
- Colours: `color.new(base, transparency)`. Choose colours that work on both light and dark chart themes.
- `overlay = true` draws on the price chart; `false` gives the indicator its own pane.
- Use `display = display.data_window` for helper values that should not clutter the chart.

## Drawings and tables

- Create once and update: `var line l = na` then `line.set_xy1(...)`. Do not create a new object on every bar unless you mean to.
- Tables: `var table t = table.new(position.top_right, cols, rows)` and fill the cells inside `if barstate.islast`.
- Use `xloc = xloc.bar_time` when drawing into the future or across timeframes.

## Alerts

- `alertcondition(cond, title, message)`: the user picks it in the TradingView alert dialog. The message must be a constant string.
  Placeholders are allowed: `{{ticker}}`, `{{close}}`, `{{interval}}`, `{{time}}`.
- `alert(message, alert.freq_once_per_bar_close)`: dynamic messages built at runtime. The user creates one "Any alert() function call" alert.
- Prefer `freq_once_per_bar_close` for non-repainting alerts.

## Inputs

```pine
GRP_MAIN = "Main settings"
lenInput   = input.int(14, "Length", minval = 1, group = GRP_MAIN, tooltip = "Bars used for the average")
srcInput   = input.source(close, "Source", group = GRP_MAIN)
tfInput    = input.timeframe("", "Timeframe", group = GRP_MAIN, tooltip = "Empty = chart timeframe")
showInput  = input.bool(true, "Show signals", group = GRP_MAIN)
```

- Every input has a sensible default, a `minval`/`maxval` where it applies, and a tooltip if its meaning is not obvious.
- Use `inline = "id"` to put related inputs on one row.

## Code style

- `camelCase` for variables and functions, `SNAKE_CASE` for constants. Inputs end in `Input`.
- Indent blocks with 4 spaces. When wrapping a long line, indent the continuation by a number of spaces
  that is **not** a multiple of 4 (e.g. 2 or 6); otherwise the compiler reads it as a new block.
- Put repeated logic in functions (`f(x) =>`). Functions cannot change global variables directly; return values instead.
- Comment the *why* of non-obvious logic, not the *what*.

## When unsure

Do not invent function names or parameters. If you are not certain that something exists in v6
(e.g. a `ta.*` function, a parameter name, a `strategy.*` field), check the official sources with WebFetch/WebSearch:

1. Language reference: https://www.tradingview.com/pine-script-reference/v6/
2. User manual: https://www.tradingview.com/pine-script-docs/
3. The v6 migration guide in that manual, for anything that changed from v5

The reference page is heavily scripted and often does not render through WebFetch. If it fails, search
`site:tradingview.com pine script v6 <function>` and fetch the manual pages that come up.
Label anything that comes from unofficial sources, and say "unverified" when you could not confirm something.
