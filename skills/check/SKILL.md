---
name: check
description: Checks a project that already exists against a brief the user gives. Quotes the brief into numbered requirements, has a blind checker that has only seen the brief try each one for real in a clean copy, and reports what holds, what holds in part and what is not there, with the evidence. Builds nothing and changes no source file; it does not matter who or what built the project. Starts only on /briefproof:check.
disable-model-invocation: true
argument-hint: "[auto|ask] <brief.md, another file with the brief, or the brief in words>"
---

# Briefproof · check a project against a brief

**First, check you are in Claude Code.** This skill needs the plugin's ledger tool,
`mcp__briefproof__state`. If it is not available, tell the user in one line,
*"Briefproof runs in Claude Code: open the Code tab (local session) or a terminal
and run `/briefproof:check <brief>`"*, and stop.

**Then check there is something to check, and something to check it against.**
- No source files in the folder (empty, or only a README and config): say so in
  one line and offer `/briefproof:build <what to build>`; do not call the ledger.
- No brief: the argument is empty, and there is no unfinished check to resume.
  Say in one line that a check needs the brief (a file such as `brief.md`, a
  ticket pasted in, or what was asked for in a few sentences) and stop. Do not
  write one yourself from the code: that is `/briefproof:adopt`.
- An unfinished Briefproof run in the folder: say so and offer to resume it.

A check answers one question: **does this project do what the brief says?** It
does not matter who built it, or with what. You build nothing, you fix nothing,
and **you change no source file**; the only thing written is `.briefproof/`.
Four stages, no questions, no tickets: Preflight, Manifest, Acceptance, Done.

## Start

```
state {action: "init", kind: "check", project: "<name>", mode: "ask"}
```

The name comes from `package.json`, `pyproject.toml`, the README's first
heading, or the folder, in that order. `auto` or `ask` as the first word of the
argument sets the mode; a check asks nothing in either, so the only difference
is the label. The reply names the run folder, `{run}`.

### 1 · Preflight: the brief, word for word

If the argument names a file that exists, the brief is that file's text.
Otherwise the brief is the argument itself. Write it to `{run}/1-brief/brief.md`
**exactly as given**: no summary, no tidying, no reordering. Replace any secret
value (a key, a password, a token) with `[redacted]` and nothing else.

A brief that is a README, a ticket or a spec is still the brief: copy it whole.
Do not read the project's code to decide what the brief "really" means, and do
not add anything the project does that the brief never asked for. `stage manifest`.

### 2 · Manifest

One `add_requirements` call. Each quote is copied verbatim from the brief: one
sentence or clause per thing the project is asked to do or to be. Split a
sentence that asks for two things into two quotes; never merge and never
rephrase.

Leave out only what is not a requirement at all: headings, greetings,
background ("I run a small studio"), install or usage instructions, licence and
badges. A line you cannot see how anyone would try ("fast", "easy to use") is
still a requirement: quote it, and let the checker say what it could and could
not try. If you left out anything a reader might count as a requirement, add
one `log` line saying what and why. `stage accept`.

### 3 · Acceptance: a stranger tries each line

Copy the project to a temp dir (`git clone` if it is a repo with no uncommitted
changes; otherwise copy the folder as it is, without `node_modules`, `.venv`,
`.git` and `.briefproof`, so uncommitted work is checked too). Spawn a fresh
subagent with `prompts/acceptance.md`, giving it *only* `{run}/1-brief/brief.md`
and the copy's path. Never give it the requirement list, this conversation, or
anything you know about how the project was built.

Save its reply, unedited, as `{run}/7-acceptance/acceptance.md`. Then record
each requirement, matching the checker's lines to the quotes by their words. A
`✓` line that covers several quotes gives each of them `done` with that
evidence. A `~partial` or `✗` line that covers several quotes does not say
which of them fell short, so do not record it yet (see the second pass below).
A quote the checker split over several lines takes the worst of them (`✗`
before `~partial` before `✓`), with that line's evidence:

- `✓` → `set_requirement {id, status: "done", files: [<its FILES>], note: "<its evidence, one line>"}`
- `~partial` → `set_requirement {id, status: "partial", files: [<its FILES>], note: "<the checker's words for the part it did not see or could not try>"}`
- `✗` → `set_requirement {id, status: "broken", files: [<its FILES, if it named any>], note: "<its evidence, one line>"}`

Do not ask whether to drop a line that failed, and do not fix it: finding it is
the point. Never mark `done` what the checker did not pass, and never turn a
`~partial` into `done` yourself.

**One second pass, if needed.** Collect the quotes the reply left out and the
quotes that share a `~partial` or `✗` line with another quote. Send them, word
for word, to a fresh checker once, in a fresh copy of the project, with
`prompts/second-pass.md`, which tries only those lines. Wait for its reply
before recording these quotes, and append it to `acceptance.md` under a `Second pass` heading. Record each quote
from its own line there. A quote still missing is `partial` with the note `the
checker did not report on this line`; quotes still merged each get the merged
line's verdict and evidence.

Record 1 to 5 files per requirement, relative to the project root, never
`node_modules` or build output: those are what Briefproof watches from now on.
`gate G4 pass` when every live requirement is `done`, `partial` or `broken`.

### 4 · Done

`stage done` first: the mod takes the proof snapshot and rewrites the report
page when this turn ends. Then write `{run}/8-report/report.md` and post the
same text in the chat, in plain language and in this order:

1. One line: how many of the brief's lines hold, how many in part, how many are
   not met.
2. **Not met**: each quote, with the checker's evidence.
3. **Partly verified**: each quote, with the part the checker did not see or
   could not try, so the user knows what to try themselves.
4. **Holds**: the quotes, one line each.
5. Anything the checker noted about running the project (missing README steps,
   a failing test suite).
6. One line: `/briefproof:change <what to fix>` works here now and will verify
   the fix and everything that already holds.

Do not write `AGENTS.md` and do not touch the project's files.

## Red flags

- You edited, formatted or "quickly fixed" a source file. A check only reads.
- A requirement in the ledger does not appear word for word in `brief.md`.
- You gave the checker the requirement list, the conversation, or a hint about
  what to look for. The second pass gets only the quotes it is about.
- You graded a line yourself because the checker's reply was unclear.
- A line is `done` on evidence that carries a caveat.

## Resume

A bare `/briefproof:check` with an unfinished check in this folder: `show`,
re-read `{run}/1-brief/brief.md`, continue from the current stage. With a
finished run and no brief given: say so, and offer `/briefproof:recheck` (the
same brief, again) or `/briefproof:change`. With a finished run and a new brief:
that is a new check; the finished run stays in its folder.
