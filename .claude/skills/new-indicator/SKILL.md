---
name: new-indicator
description: Create a new TradingView indicator from an idea, going from spec to code to review to test checklist.
argument-hint: <describe the indicator idea>
disable-model-invocation: true
---

# New indicator workflow

The user's idea: $ARGUMENTS

Follow these steps in order. Use the `pine-script` skill rules throughout.

## 1. Clarify (only what matters)

If any of these cannot be reasonably inferred from the idea, ask the user once, in a single question round:

- Overlay on price, or a separate pane?
- What exactly triggers a signal (if any)? Should signals wait for bar close (non-repainting)?
- Does it need alerts?
- Does it use another timeframe or symbol?

Pick sensible defaults for everything else and record them in the spec.

## 2. Write the spec

Create `indicators/<kebab-name>/spec.md`:

```markdown
# <Indicator name>

## Purpose
One or two sentences: what it shows and how a trader would use it.

## Logic
Step by step, in plain language and formulas. Precise enough to re-implement without the code.

## Inputs
| Input | Type | Default | Meaning |

## Outputs
Plots, shapes, colours, tables, and what each one means.

## Alerts
Each alert: when it fires and its message.

## Repainting
Non-repainting (default) or the exact reason it repaints.

## Acceptance checks
Concrete things the user can verify on a chart (e.g. "on BTCUSD 1D, the line equals the 20 EMA when smoothing = 1").
```

## 3. Write the code

Create `indicators/<kebab-name>/<kebab-name>.pine` starting from [template.pine](template.pine).
Implement exactly what the spec says. Set the header version to `0.1.0`.

## 4. Review

Launch the `pine-reviewer` agent with the path of the `.pine` file and its `spec.md`.
It fixes errors and applies safe improvements itself. Keep its "Proposed" items for the handover;
do not apply them unless the user agrees.

## 5. Changelog

Create `indicators/<kebab-name>/CHANGELOG.md`:

```markdown
# Changelog

## 0.1.0 — <today's date>
- Initial version.
```

## 6. Hand over

Tell the user:

1. The path of the `.pine` file to copy.
2. How to load it: TradingView → Pine Editor → open a new indicator → paste over everything → Save → "Add to chart".
3. The acceptance checks from the spec as a short checklist, plus:
   - Try 2–3 symbols and at least one intraday and one daily timeframe.
   - Use Bar Replay to check that past signals do not change (repainting check).
4. The reviewer's proposed improvements, if any, as a short list the user can accept or reject.
5. If it fails to compile, run `/fix-pine` with the error message.
