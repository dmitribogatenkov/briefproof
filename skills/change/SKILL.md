---
name: change
description: Changes a project that Briefproof already built, with the same discipline at small scale. The request becomes new quoted requirements, a spec delta, only the tickets that change, and a blind re-check of the request plus a regression pass over what the base run delivered. Starts only on /briefproof:change.
disable-model-invocation: true
argument-hint: "[auto|ask] what to change, in plain words"
---

# Briefproof · change request

**First, check you are in Claude Code.** This skill needs the plugin's ledger tool,
`mcp__briefproof__state`. If it is not available, tell the user in one line,
*"Briefproof runs in Claude Code: open the Code tab (local session) or a terminal
and run `/briefproof:change`"*, and stop.

A change request is a short Briefproof run on top of a finished one. Everything
in `/briefproof:build` still holds (read its five rules if you have not this
session): the request is quoted, never paraphrased; a stranger checks the result
against the words; no code before the spec delta; one fresh executor per ticket.
What differs is scope: you touch only what the request needs, and you prove the
rest still works.

## Start

```
state {action: "init", kind: "change", request: "<the user's words, verbatim>", mode: "ask"}
```

The ledger refuses when this folder has no finished run (tell the user to run
`/briefproof:build` first) or when the run is unfinished (resume it instead).
On success it creates a new run folder, `{run}`, and names the base run,
`{base}`. The mod has already written:

- `{run}/1-brief/brief.md`: the base brief with a `## Change request` section
  holding the request verbatim. This is the brief for this run.
- `{run}/1-brief/base-requirements.md`: what the base run delivered, for the
  regression pass.

Read `{base}/4-spec/spec.md`, `{base}/4-spec/interfaces.md` and the project's
`AGENTS.md` before anything else. You are changing a known system, not
discovering one.

## Stages

The eight stages are the same and the pane shows them the same way; most are
shorter.

1. **Preflight.** Confirm the working tree is clean (commit or ask). `stage manifest`.
2. **Manifest.** `add_requirements` with verbatim quotes from the *change
   request section only*. The base requirements are not re-added; they are the
   regression list.
3. **Briefing.** Ask only what the request leaves open, one round, suggested
   answer first, through `AskUserQuestion`. Often nothing.
4. **Spec.** Write `{run}/4-spec/spec.md` as a **delta**: start with one line
   naming the base spec, then only the sections that change, each saying what it
   replaces. Copy `{base}/4-spec/interfaces.md` to `{run}/4-spec/interfaces.md`
   and amend it; never edit the base run's files. **Gate G2:** the coverage
   checker reads `{run}/1-brief/brief.md` and the delta; tell it to check the
   change request section against the delta.
5. **Plan.** Tickets for the change only, each naming the files it owns. If a
   change touches a shared boundary, the three-ticket rule from the build skill
   applies (add beside, migrate, remove). **Gate G3**, commit the plan.
6. **Build.** Waves, fresh executors, reviews where it pays, exactly as in the
   build skill. Executors read `{run}/4-spec/interfaces.md`.
7. **Acceptance.** Clone to a temp dir and spawn the blind checker with
   `prompts/acceptance.md`, giving it `{run}/1-brief/brief.md`,
   `{run}/1-brief/base-requirements.md` and the clone. Tell it: *check every
   sentence of the Change request section as the brief; then, for each line of
   base-requirements.md, confirm it still holds with one quick check each and
   report any that broke.* A broken base requirement is a fix ticket before
   anything else. Save the reply as `{run}/7-acceptance/acceptance.md`. `gate G4`.
8. **Report.** `{run}/8-report/report.md`: what changed and why, the new `R##`
   table, the regression result (N of N base requirements still hold), anything
   deferred, and the usage table from `show`. Update `AGENTS.md` if how to run
   or test changed. `stage done`.

## Red flags

- You edited a file under `{base}/`. Base runs are history.
- A base requirement broke and the report says "done" anyway.
- You rewrote the whole spec instead of a delta: the reader loses what changed.
- The request grew into a redesign. Say so, and offer `/briefproof:build` with a
  new brief instead.

## Resume

A bare `/briefproof:change` with an unfinished change run in this folder: `show`,
re-read `{run}/1-brief/brief.md` and the current stage's files, continue.
