---
name: build
description: Builds an app, site, bot or feature end-to-end from a plain-language brief: requirements manifest, spec, tickets, one fresh subagent per ticket, then a blind acceptance check against the user's original words. Starts only on /briefproof:build; a bare /briefproof:build resumes an interrupted run.
disable-model-invocation: true
argument-hint: "[auto|ask] what to build, or a path to brief.md"
---

# Briefproof

**First, check you are in Claude Code.** This skill needs the plugin's ledger tool,
`mcp__briefproof__state`. If that tool is not available, you are in a chat or
Cowork session where the plugin's mod does not run: tell the user in one line,
*"Briefproof runs in Claude Code: open the Code tab (local session) or a terminal
and run `/briefproof:build`"*, and stop.

Turn a described idea into a working, verified project in one conversation.
**Sequence beats speed.** No code until stage 6 of 8. The early stages pin down
what the user actually asked for; the late stages verify that this, and nothing
less, was delivered.

## The five rules that never bend

1. **Nothing quietly vanishes.** The user's words become a numbered manifest
   (`R01`, `R02`…) before anything else. A requirement leaves only as `deferred`
   or `dropped` *with the user's own quote*. Silence never cancels.
2. **The writer never grades.** Coverage and acceptance are checked by a fresh
   subagent that sees the brief and the project, never the spec, manifest or
   tickets. An author reviewing their own spec reads intent, not text, so gaps stay invisible.
3. **The orchestrator never writes code.** Your context lives for the whole run
   and is never refreshed. One ticket → one fresh executor subagent.
4. **Never ask for secrets, never do the irreversible unasked.** Ask *which*
   provider, never the key; refer to `STRIPE_SECRET_KEY` by name, `.env` is
   git-ignored before the first commit. Deploying, paying, sending, deleting
   data: always ask first, in every mode.
5. **"Works" means it ran.** Tests were written by the same process as the code.
   The project is started for real before anyone says done.

## State and progress

All run state lives in `.briefproof/state.json`, written **only** through the
`mcp__briefproof__state` tool (the plugin's own ledger: no install, no approval
prompts). One call per event; batch where the tool allows:

```
state {action: "init", project: "Massage booking", mode: "ask"}
state {action: "stage", stage: "spec"}         # preflight|manifest|briefing|spec|plan|build|accept|done
state {action: "add_requirements", quotes: ["verbatim quote", "another"]}   # → R01, R02
state {action: "set_requirement", id: "R03", status: "in-spec"}             # open|in-spec|done|deferred|dropped (+reason)
state {action: "add_tickets", tickets: [{title: "Booking request form", reqs: ["R01","R02"], review: true}]}  # → T01
state {action: "set_ticket", id: "T01", status: "running"}                  # todo|running|review|done|failed
state {action: "gate", gate: "G2", result: "pass", note: "independent reader found nothing missing"}
state {action: "log", message: "one line the user would care about"}
state {action: "check"}   # gate problems; "ok" when clean. A gate can't pass while its problems remain.
state {action: "show"}    # plain-text summary
```

Never edit `state.json` by hand. The live pane beside the conversation renders it;
`log` at every stage change; that line is what the user watches.

**Models are chosen by the plugin, not by you.** The user picks a model per
stage in the plugin's settings (`/plugin configure briefproof@briefproof`); the
mod applies it to every request of that stage, subagents included. Never pass a
`model` when spawning a subagent, and never argue a stage onto a bigger model.
Token usage per stage is recorded in the ledger (`show` prints it); put that
table in the final report.

**The user steers from the pane.** Their clicks reach you as their own messages:
- *"I dropped/deferred R03 … In my words: …"*: the ledger already has the status
  and their reason. Update `spec.md` and the plan to match; never argue it back in.
- *"New requirement R07: …"*: already in the ledger and in `brief.md` under
  Additions. Fit it into the spec and plan (a new ticket if the build is under way).
- **Pause.** The ledger refuses `set_ticket … running` while paused. Finish the
  ticket in progress, commit it, then end your turn. *"Resume the Briefproof run."*
  means continue where you stopped.

## The run

Announce in one short block: mode, what happens next, that the progress pane is
open beside the chat, and that the user can say "auto" or "ask more" any time.

**Modes.** `ask` (default): ask only what the brief leaves open, in one round
(a second only if an answer opens a new fork). `auto`: ask nothing; every decision you made goes into the final
report under *Assumptions*. Irreversible actions are asked in both.

### 1 · Preflight
`init`, `git init` if needed, `.gitignore` with `.env`. Copy the brief
verbatim (secrets redacted to `<REDACTED>`) to `.briefproof/brief.md`. The user's
own brief file is never modified.

### 2 · Manifest
Split the brief into atomic requirements, each a **verbatim quote**: one `add_requirements` call with all of them.
Don't paraphrase, don't merge, don't add your own ideas here.

### 3 · Briefing
Find the forks the brief leaves open (storage, auth, hosting, payment, who the
users are, what "done" looks like). Ask them in **one round** with the standard
`AskUserQuestion` tool: short plain questions, 2 to 4 options each, **your pick
listed first** (the pane shows it as the suggestion). Payment, hosting and
accounts are settled here, never stubbed "for later". The pane mirrors the open
dialog, so nothing else is needed to keep the user informed. New wishes from the user mid-run are appended to `brief.md` under
`## Additions` and added as new `R##`; the blind checker reads the brief, not
the manifest.
**Gate G1:** every requirement has a status other than `open`, or a recorded reason.

### 4 · Spec
Write `.briefproof/spec.md`: behaviour, data, empty states, errors, limits; the
brief usually describes only the happy path, so working out what happens off
it is part of your job. Deepen what was asked; don't invent new features. Then write
`.briefproof/interfaces.md`: module boundaries, shared types, project rules,
**before** any ticket, so ticket 01 doesn't decide the architecture alone.
Mark each covered requirement `in-spec`.
**Gate G2:** spawn a fresh subagent with `prompts/coverage.md`, giving it
*only* `brief.md` and `spec.md` paths. Anything it reports missing → fix the
spec and re-run once. `gate G2`.

### 5 · Plan
Write `.briefproof/tickets/NN-slug.md`: goal, the `R##` it serves, files it may
touch, acceptance criteria, how to verify. Small and vertical; a change to a
shared thing is three tickets (add new beside old → migrate → remove old).
Set `review: true` on the foundation ticket and anything risky (auth, money, data
migration). One `add_tickets` call for the whole plan.
**Gate G3:** `check`: every `in-spec` requirement is in a ticket and every
ticket traces to one. Commit the plan.

### 6 · Build
For each ticket in dependency order (independent ones in parallel):
`set_ticket` running, spawn a **fresh** subagent with `prompts/executor.md`
filled in. It returns `DONE`, `DONE_WITH_NOTES`, or `BLOCKED: <reason>`.
- `DONE` → if marked for review, spawn a fresh reviewer (same prompt, review section);
  only its `BLOCKING:` lines go back for a fix, at most twice. Then one commit
  per ticket, `set_ticket` done.
- `BLOCKED` → resolve the blocker (answer, or a new ticket); never finish it
  yourself. If the build proves the spec wrong, amend the spec and `log` why;
  never retire a requirement this way.
- Append what each finished ticket built to `interfaces.md` so later tickets see it.

After the last ticket: one review of the whole branch by a fresh subagent.

### 7 · Acceptance
**Gate G4:** clone the repo to a temp dir, then spawn a fresh subagent with
`prompts/acceptance.md`, giving it *only* `brief.md` and the clone. It installs,
runs and checks each sentence of the brief. Every gap becomes a fix ticket;
re-check once. `gate G4`.

### 8 · Report
Compose from files re-read from disk, not from memory. In plain language:
what was built and how to run it; requirement table (R##, quote, status);
*Assumptions* (in auto mode); env var names still empty; anything deferred;
the usage-by-stage table from `show`.
Write `AGENTS.md` (project memory: how to run, test, where things are; pointers,
not prose) unless the user already has one. `stage done`.

## Red flags: stop and redo the stage

- Code exists before `spec.md`.
- A requirement `dropped` without the user's quote.
- You graded G2 or G4 yourself, or gave the checker the spec/manifest.
- You wrote code in the orchestrator "because it's two lines".
- The report written from memory, or the project never actually started.

## Resume

A bare `/briefproof:build` with an existing `.briefproof/state.json`: call `show`, re-read
`brief.md`, `interfaces.md` and the current stage's files, then continue.
After a context compaction, do the same: re-read state, not this whole file.
