---
name: recheck
description: Re-verifies a finished Briefproof run after its files changed. A blind checker tests the requirements whose evidence files moved, the ledger records what still holds and what broke, and the proof snapshot is retaken so the pane's warning clears. Starts only on /briefproof:recheck, usually from the pane's Re-check button.
disable-model-invocation: true
argument-hint: "(no arguments; checks the requirements the pane marked as stale)"
---

# Briefproof · re-check

**First, check you are in Claude Code.** This skill needs the plugin's ledger tool,
`mcp__briefproof__state`. If it is not available, tell the user in one line,
*"Briefproof runs in Claude Code: open the Code tab (local session) or a terminal
and run `/briefproof:recheck`"*, and stop.

A re-check answers one question: does the project still do what the last run
proved? It builds nothing and changes no source file. Fixing is
`/briefproof:change`.

## Start

`state {action: "show"}`. It prints the run folder, `{run}`, and, when files
moved, a `drift:` line naming the changed files and the requirements that depend
on them (`R03, R05 may be stale`; `R02 (base)` means a requirement of the run
this one was a change to). If there is no finished run, say so and stop. If
`show` prints no `drift:` line, nothing changed since the last check: say so in
one line and stop, unless the user asked in words for a full re-check; then every
live requirement is on the list.

`state {action: "recheck"}`. From here the ledger routes your requests and the
checker's to the Acceptance model and counts them there; the pane shows the
re-check in progress. (The pane's button has usually done this already; calling
it again is harmless.)

## Check

Clone the project to a temp dir (`git clone`, or copy without `node_modules`,
`.venv`, `.git`). Spawn a fresh subagent with `prompts/recheck.md`, giving it
*only* `{run}/1-brief/brief.md`, the clone, and the quotes of the stale
requirements. For a change run, the brief already carries the `## Change
request` section; for a base requirement, take its quote from
`{run}/1-brief/base-requirements.md`.

Save its reply as `{run}/7-acceptance/recheck-<YYYYMMDD-HHMM>.md`; never
overwrite `acceptance.md`.

## Record

Per requirement the checker reported on:

- `✓` → `set_requirement {id, status: "done", files: [<its FILES>], note: "<evidence>"}`.
  Pass the files even when they did not change; the new list replaces the old one.
  Paths are relative to the project root; the ledger refuses absolute ones.
- `✗` or `~partial` → `set_requirement {id, status: "broken", note: "<evidence>"}`.
  Do not ask whether to drop it: the user asked for it once, and it held; now it
  does not. The pane shows it as "no longer holds" until a change run fixes it.
- A **base** requirement (`R02 (base)`) has no id in this run. If it still holds,
  nothing to record. If it broke: `add_requirements {quotes: ["<its quote>"]}`,
  then `set_requirement` on the new id with `status: "broken"`, the files and the
  note `base R02 broke: <evidence>`. It is now this run's problem to show.

Then `state {action: "snapshot"}`. The ledger hashes the evidence files as they
are now, this run's and its base's; the pane's warning clears and the report
page is rewritten.

## Report

Two to five lines in the chat: how many were checked, which still hold, which
broke (with the evidence in a few words), and, if anything broke,
`/briefproof:change <what to fix>` as the next step. No file needs writing beyond
the recheck reply.

## Red flags

- You fixed something. A re-check only looks.
- You marked a requirement `done` that the checker did not see work.
- You skipped `snapshot`: the warning stays, the Acceptance model stays in force,
  and the next session repeats the work.
