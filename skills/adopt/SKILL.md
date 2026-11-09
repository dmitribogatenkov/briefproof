---
name: adopt
description: Brings a project that already exists under Briefproof. Writes the brief it never had (what it does today, in plain sentences), quotes it into numbered requirements, confirms them with the user, and has a blind checker verify each one in the code and record the files it lives in. The result is a finished run, so /briefproof:change works on the project from then on. Starts only on /briefproof:adopt.
disable-model-invocation: true
argument-hint: "[auto|ask] [the project's name, or a note on what matters]"
---

# Briefproof · adopt an existing project

**First, check you are in Claude Code.** This skill needs the plugin's ledger tool,
`mcp__briefproof__state`. If it is not available, tell the user in one line,
*"Briefproof runs in Claude Code: open the Code tab (local session) or a terminal
and run `/briefproof:adopt`"*, and stop.

**Then check there is a project.** Look at the folder. If it has no source files
(empty, or only a README and config), say so in one line and offer
`/briefproof:build <what to build>` instead; do not call the ledger. If the
folder already has an unfinished Briefproof run, say so and offer to resume it.

Adoption writes nothing into the project except `.briefproof/` and, if missing,
`AGENTS.md`. **You change no source file.** The point is a brief the project
never had, verified line by line, so that `/briefproof:change` has something to
stand on. Five stages, no tickets: Preflight, Manifest, Briefing, Acceptance, Done.

## Start

```
state {action: "init", kind: "adopt", project: "<name>", mode: "ask"}
```

The name comes from `package.json`, `pyproject.toml`, the README's first
heading, or the folder, in that order; the user's argument wins if they gave one.
The reply names the run folder, `{run}`.

### 1 · Preflight: read the project

Read, in this order and no further than needed: the README, the manifest
(`package.json`, `pyproject.toml`, `go.mod`, `Cargo.toml`, …), the entry
points, routes or commands, the tests, CI config, and `.env.example`. Use
`Glob`, `Grep` and `Read`. Do not run anything yet. Then write
`{run}/1-brief/brief.md`:

```
# <project>

What this project does today, as its owner would tell a newcomer.

- <one observable behaviour per line, in plain words, present tense>
- …

## How to run it
<the commands, from the README or the scripts, one per line>

## Claims not found in the code
- <anything the README promises that nothing in the code does>
```

Rules for the bullets: each one is something a user can see the project do
(“lists the services with prices”, “sends a confirmation email after booking”),
never architecture (“uses Express”) and never a wish. Write from what the code
does, not what the README says; a README claim with nothing behind it goes under
the last heading. Aim for 5 to 20 lines; a large project gets its main behaviours,
not every endpoint. `stage manifest`.

### 2 · Manifest

One `add_requirements` call quoting the bullets verbatim, in order. The “Claims
not found” lines are not requirements. `stage briefing`.

### 3 · Briefing: the owner corrects the brief

**ask mode.** The pane shows the list. One `AskUserQuestion` round:
*“Is this what the project does? Anything wrong or missing?”* with options
**Yes, that is it** (first), **Some lines are wrong**, **Something is missing**.
If they pick the second or third, let them say which in the pane (Defer, Drop
with their words, or type a new line; each lands in the ledger and in
`brief.md` under Additions) or in chat; apply what they say with
`set_requirement` / `add_requirements`, never argue a line back in. One round;
a second only if their answer opened a new question.

**auto mode.** Skip the question; write `{run}/3-briefing/decisions.md` with one
line per judgment call you made writing the brief.

After the round, mark every line the user kept as confirmed:
`set_requirement {id, status: "in-spec"}` (here it means "confirmed, to be
verified"; the ledger's G1 refuses to pass while a line is still `open` without
a reason). Lines they set aside are `deferred` or `dropped` with their words.
**Gate G1:** `gate G1 pass`, then `stage accept`.

### 4 · Acceptance: a stranger verifies each line in the code

Clone the project to a temp dir (`git clone` if it is a repo, else copy without
`node_modules`, `.venv`, `.git`). Spawn a fresh subagent with
`prompts/acceptance.md`, giving it *only* `{run}/1-brief/brief.md` and the clone
path. It installs and runs what it can, checks each bullet for real, and for each
one names the files where that behaviour lives.

Save its reply unedited as `{run}/7-acceptance/acceptance.md`. Then, per line:

- `✓` → `set_requirement {id, status: "done", files: [<its FILES>], note: "<its evidence, one line>"}`
- `✗` → in ask mode, one question: *“The checker could not find ‘…’. Drop it
  from the brief, or keep it as not working?”* **Drop** (their words become the
  reason) or **Keep as broken**. In auto mode: `status: "broken"` with the
  evidence as the note. Never mark done what the checker did not see.
- `~partial` → treat as `✗`, and put the checker's words in the note.

The files you record are what Briefproof watches from now on: when one changes,
the pane says which requirements may be stale and offers a re-check. Record 1 to
5 files per requirement, relative to the project root, never `node_modules` or
build output. `gate G4 pass` when every live requirement is `done` or `broken`.

### 5 · Done

`stage done` first: the mod takes the proof snapshot, the report and `AGENTS.md`
are written on the Done model, and the report page is rewritten when this turn
ends. Then write `{run}/8-report/report.md`: what the project does today (the
verified lines), what was claimed and not found, how to run and test it, and one line
saying that `/briefproof:change <what to change>` now works here. Post the same
text in the chat. Write `AGENTS.md` (how to run, test, where things are) unless
the project has one.

## Red flags

- You edited a source file. Adoption only reads.
- A requirement is `done` with no `files`: the drift check has nothing to watch.
- The brief describes the architecture instead of the behaviour.
- A README promise became a `done` requirement without the checker seeing it run.

## Resume

A bare `/briefproof:adopt` with an unfinished adoption in this folder: `show`,
re-read `{run}/1-brief/brief.md`, continue from the current stage. With a
finished run: say so and offer `/briefproof:change`.
