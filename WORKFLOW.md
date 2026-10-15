# How this indicator kit works

## The pieces

| File | Type | What it does | When it runs |
|---|---|---|---|
| `CLAUDE.md` | Project instructions | House rules: folder layout, always v6, versioning, review before handover | Loaded automatically in every session in this folder |
| `.claude/skills/pine-script/SKILL.md` | Knowledge skill | Pine v6 rules: syntax changes, repainting, limits, alerts, style | Claude loads it automatically whenever Pine code is involved |
| `.claude/skills/new-indicator/` | Workflow skill | Idea → spec → code → review → test checklist. Includes `template.pine` | You type `/new-indicator <idea>` |
| `.claude/skills/fix-pine/SKILL.md` | Workflow skill | Diagnose and fix a TradingView error or wrong behaviour | You type `/fix-pine <name> <error>` |
| `.claude/agents/pine-assessor.md` | Agent | Studies a sample: explains it, adds reusable techniques to `samples/TAKEAWAYS.md`, and adapts it into a new v6 indicator if you ask | You paste or drop in sample code |
| `.claude/agents/pine-reviewer.md` | Agent | Finds problems (compile errors, repainting, spec mismatches, performance), fixes them, applies safe improvements, and proposes behaviour changes for you to decide | After any new or changed `.pine` file, or ask "review X" |

Both agents check the official TradingView docs when they are unsure about a function.

**Skill vs agent:** a skill is instructions loaded into the *current* conversation.
An agent is a *separate* Claude with its own context and limited tools, which returns a report.
The reviewer is an agent on purpose: it hasn't seen the reasoning that produced the code, so it judges the code on its own terms.

## Learning from samples

```
Paste code (or drop a .pine file in the folder) and say what you want, e.g.
  "assess this"                                  → understanding only
  "assess this and make a v6 version with alerts" → understanding + new indicator
   │
   ▼  Claude saves it untouched to samples/<name>/original.pine
pine-assessor
   ├─ samples/<name>/assessment.md     what it does, how, weaknesses, ideas
   ├─ samples/TAKEAWAYS.md             new reusable techniques appended
   └─ indicators/<new-name>/           only if you asked for a modified version
   │
   ▼  if a .pine file was created
pine-reviewer → fixes + "Proposed" list for you to accept or reject
```

`TAKEAWAYS.md` grows into your personal library of techniques. Mention it when you want a new indicator built from them,
e.g. "build X using the HTF trick from TAKEAWAYS".

## Day-to-day workflow

```
/new-indicator <idea>
   │  Claude asks 1 round of questions if needed
   ▼
indicators/<name>/spec.md        ← the source of truth; read it, correct it
indicators/<name>/<name>.pine    ← written from the spec
   │  pine-reviewer fixes problems, proposes bigger changes for you
   ▼
You paste the .pine file into the TradingView Pine Editor → Add to chart
   │
   ├─ compile error?        → /fix-pine <name> <paste the error>
   ├─ looks wrong on chart? → /fix-pine <name> <symbol, timeframe, date, what you expected>
   └─ want a change?        → just say it: "add an RSI filter to <name>"
                               (Claude updates spec.md, then code, then CHANGELOG)
```

Each change bumps the version (`0.1.0` → `0.1.1` fix, `0.2.0` feature) and gets a CHANGELOG line,
so you can always tell which version is on your chart.

## Changing the kit as you go

All of these are plain Markdown files. Edit them yourself or ask Claude to do it.

- **Claude keeps making the same Pine mistake** → add a rule to `pine-script/SKILL.md`
  (e.g. under "v6 changes" or "Code style"). It applies to every indicator from then on.
- **You have personal preferences** (colours, always add a dashboard table, always add alerts) →
  add them to `CLAUDE.md` under Rules, or into `template.pine` so new indicators start that way.
- **The reviewer misses something, or nags too much** → edit its checklist in `agents/pine-reviewer.md`.
- **The reviewer changes too much, or too little, by itself** → move items between its "Apply directly" and "Propose" lists.
- **You want assessments to cover something else** (e.g. "rate it for scalping vs swing") → add a section to Step 1 in `agents/pine-assessor.md`.
- **A new TradingView error keeps showing up** → add a row to the table in `fix-pine/SKILL.md`.
- **New repeatable task** (e.g. convert an indicator to a strategy, write a publish description) →
  create `.claude/skills/<name>/SKILL.md` with the same frontmatter shape. It becomes `/<name>`.
- **New specialist** (e.g. a backtest-results analyst) → create `.claude/agents/<name>.md`.

Tip: after a fix, ask "add what we learned to the skill" so the lesson isn't lost.

New or edited skills and agents are picked up in a new session (or after `/agents` for agents).
