# Pine Script Indicators

This project holds custom TradingView indicators written in Pine Script v6.
There is no local compiler: code is tested by pasting it into the TradingView Pine Editor.
The user reports compile errors and chart behaviour back here.

## Layout

```
indicators/<indicator-name>/      kebab-case folder, one per indicator
  spec.md                         what the indicator should do (source of truth)
  <indicator-name>.pine           the code (paste this into TradingView)
  CHANGELOG.md                    version history, newest first
samples/<sample-name>/            code the user collected from elsewhere
  original.pine                   the sample exactly as given (never edit)
  assessment.md                   written by pine-assessor
samples/TAKEAWAYS.md              reusable techniques gathered from all samples
```

## Agents

- `pine-assessor`: when the user shares sample code (pasted or as a file), first save it unchanged to
  `samples/<kebab-name>/original.pine`, then launch this agent on it, passing along any modification instructions.
- `pine-reviewer`: run it on every new or changed `.pine` file (with its `spec.md`) before handing it over,
  including files the assessor just created. Agents cannot launch each other, so the main session chains them.
  Show the user its "Proposed" items and apply them only if the user agrees.

## Rules

- Always use `//@version=6`. Never write v4/v5 syntax.
- Follow the `pine-script` skill for syntax, repainting and style rules.
- If unsure whether a built-in function or parameter exists, check the official docs (see the `pine-script` skill) rather than guessing.
- Keep `spec.md` in sync: if the user changes behaviour, update the spec first, then the code.
- Every code change bumps the version in the script header and adds a CHANGELOG entry
  (patch = bug fix, minor = new feature/input, major = changed logic or signals).
  The main session does this, using the reviewer's report; the agents do not touch versions.
- The user tests in TradingView, so always end with a short "how to test this" checklist.
