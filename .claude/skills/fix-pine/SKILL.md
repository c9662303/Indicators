---
name: fix-pine
description: Fix a TradingView compile error, runtime error, or wrong chart behaviour in one of the project's indicators.
argument-hint: <indicator name> <pasted error or description of what looks wrong>
disable-model-invocation: true
---

# Fix a Pine Script problem

Problem reported: $ARGUMENTS

## 1. Locate

- Find the indicator under `indicators/`. If the name is ambiguous or missing and there is more than one indicator, ask which one.
- TradingView error messages include a line number (e.g. `line 42: ...`). It matches the file's line numbers
  if the user pasted the whole file unchanged. If the line does not make sense, ask the user to paste the line from their editor.

## 2. Diagnose

Common errors and their usual cause:

| Error text (partial) | Usual cause and fix |
|---|---|
| `Undeclared identifier` | Typo, missing namespace (`sma` → `ta.sma`), or a variable used before it is declared |
| `Mismatched input` / `no viable alternative` | Indentation. Blocks use 4 spaces; wrapped lines must be indented by a non-multiple of 4 |
| `... 'series int' was used but a 'simple int' is expected` | A `ta.*` length that changes per bar. Use an input or a constant |
| `Cannot use 'plot' in local scope` | `plot`/`plotshape`/`bgcolor`/`alertcondition` inside `if` or a function. Move it to global scope and pass `na` when hidden |
| `cannot be na` / `na(...)` on a bool | v6: bools cannot be `na`. Initialise with `false` |
| `Cannot call 'operator ...' with argument ... 'int'/'float' ... 'bool'` | v6: no implicit number → bool. Use an explicit comparison |
| `The function 'ta.xxx' should be called on each calculation for consistency` | A `ta.*` call inside a condition, loop, or after `and`/`or`. Move it to a global variable |
| `Pine cannot determine the referencing length of a series` | Add `max_bars_back(series, n)` or the `max_bars_back` parameter in `indicator()` |
| `The script must have at least one output` | An indicator with no plot. Add a `plot` (or `plot(na)` if it only draws objects) |
| `Loop takes too long` / `Script execution timeout` | Too much work per bar. Cut loop length, cache results with `var`, or only compute on `barstate.islast` |
| `Too many securities` | Too many `request.*` calls. Combine with tuples |

For **wrong behaviour** (it compiles, but the chart looks wrong):
compare the code with `spec.md` first. Typical causes are repainting, an off-by-one in `[n]` references, `na` at the start of history,
or a timeframe mismatch. Ask the user for the symbol, timeframe, and the bar date where it looks wrong if that is not already given.

If you are unsure what a built-in expects, check the official docs (see "When unsure" in the `pine-script` skill).

## 3. Fix

- Make the smallest change that fixes the problem. Do not refactor unrelated code.
- If the fix changes behaviour, update `spec.md` too.
- Bump the patch version in the header (e.g. `0.1.0` → `0.1.1`) and add a CHANGELOG entry describing the fix.

## 4. Hand over

Show the user the changed lines with a one-sentence explanation of the cause, then remind them to paste the whole file into TradingView again.
