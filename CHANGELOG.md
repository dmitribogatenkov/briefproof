# Changelog

All notable changes to Briefproof. The version is the `version` field in
`.claude-plugin/plugin.json`; `claude plugin update briefproof@briefproof` picks
up a new one.

## 0.10.0 · 2026-11-07

The proof outlives the run: it works on projects you did not build with
Briefproof, and it tells you when it goes stale.

### Added
- **Adopt an existing project.** `/briefproof:adopt` reads the code, writes the
  brief the project never had (plain sentences a user could see it do), quotes
  them into numbered requirements, asks you to correct the list once, then has a
  blind checker verify each line in a clean copy and record the files it lives
  in. Five stages, no tickets, nothing in the project changes. The result is a
  finished run, so `/briefproof:change` works on the project from then on. A
  README promise the checker cannot find is recorded as not holding, never
  passed.
- **Evidence per requirement.** The acceptance check now names the files behind
  each requirement; the skill records them with
  `set_requirement {files, note}`. They appear in `requirements.md`, in the
  report page under each quote, and in `state.json`.
- **Proof drift.** When a run finishes, the ledger hashes those files
  (`state.json` → `proof`). Opening Claude Code in the folder later compares
  them: the pane lists what changed, names the requirements that may be stale,
  says so in the status line and in `show`, and offers **Re-check**.
- **Re-check.** `/briefproof:recheck` (the pane's button) runs the blind checker
  on the stale requirements, marks each as still holding or `broken`, saves the
  reply as `7-acceptance/recheck-<stamp>.md`, and the new `snapshot` ledger
  action retakes the proof so the warning clears. Nothing is fixed behind your
  back; a broken requirement stays visible until a change run fixes it.
- A `broken` requirement status: it held once and no longer does, or was claimed
  and not found. Shown in red in the pane and the report; counts as not
  delivered.
- An eval case: `/briefproof:adopt` on an empty folder must stop and point to
  `/briefproof:build`.

### Changed
- `init` accepts `kind: "adopt"`; `stage` only accepts the run's own stages, so
  an adoption cannot wander into Spec or Build; `add_tickets` refuses on an
  adopted project.
- The report page is rewritten after a re-check, and its footer says when the
  evidence was last checked.
- The empty pane mentions `/briefproof:adopt`; a bare `/briefproof:build` in a
  folder with code but no run offers it too.
- CI validates the plugin and runs the tests on every push, and nothing else:
  the weekly eval schedule is gone, since the evals cost real tokens and need
  an API key in the repo. They run by hand (README, Contributing).
- `stage done` now comes first in the report step of build, change and adopt, so
  the report and `AGENTS.md` are written on the Done model the settings name.
  The report page is rewritten when that turn ends.

### Fixed
- A finished run kept routing every later request in its folder to the Done
  model and counting the tokens as its own. Only the turn that finishes the run,
  and a re-check, do that now.
- A change request that failed half-way pointed `.briefproof/current` at an empty
  folder: the finished run vanished from `show` and the request could not be
  retried. The pointer is now written last.
- A reviewer's reply that listed a blocking issue and mentioned "DONE" closed the
  ticket. An executor's `DONE` whose notes mentioned "BLOCKED" read as blocked,
  and "not DONE yet" read as done. Verdicts are now read the way the prompts ask
  for them: the executor's verdict line, the reviewer's `BLOCKING:` section.
- A spawn could be matched to a ticket the prompt only mentioned as a
  dependency, a description with "review" in it made a reviewer, and tickets
  past T99 were never matched.
- Going back to a stage lost the time of the second visit.
- Finishing a run twice added two entries to the stats the estimate learns from.
- G2 and G4 checked nothing. G2 now refuses while a requirement is still open,
  and G4 refuses while a live requirement is neither `done` nor `broken`.
- After the budget limit changed, crossing the new one sent no notification, and
  an earlier "Continue anyway" waived it too.
- A requirement kept its "deferred" reason after going back to open, which let
  it pass G1 unexplained.
- Two requirements added from the pane in quick succession could lose one line
  of the brief. In a change run they landed under the change request instead of
  `## Additions`.
- A quote with a line break broke the table in `requirements.md`.
- Token counts: 999,999 showed as "1000k" and 9,999 as "10.0k".
- The report page: a `######` heading became `<h7>`, and the mode and model
  names went in unescaped.
- The dialog's answers file is written in the same queue as the ledger.

## 0.9.0 · 2026-11-01

It works on the project you already have.

### Added
- **Change requests.** `/briefproof:change <what to change>` runs the same
  discipline on top of a finished run: the request becomes new quoted
  requirements, the spec is a delta, only the tickets that change are built,
  and the blind checker verifies the request sentence by sentence, then
  confirms everything the base run delivered still holds. The ledger refuses a
  change when there is no finished run, or when the current one is unfinished.
- **Run history.** Every run lives in `.briefproof/runs/<date>-<slug>/`;
  `.briefproof/current` names the current one. A finished run stays in its
  folder; the next `init` starts a new one. Runs from before 0.9 keep working
  where they are.
- **An estimate before the build.** At the Plan stage the pane and `show` say
  roughly how many tokens and minutes this many tickets will take, from your
  past runs (`~/.briefproof/stats.json`, one line per finished run) or a stated
  default before the first. In ask mode the agent asks Go, set a budget, or
  stop. A `budget {limit}` ledger action and a field in the pane set a budget
  for this run, which wins over the setting.
- **A report page.** On Done the mod writes `8-report/report.html`: the agent's
  report rendered, every requirement with its status and the reason for
  anything set aside, the tickets, gates, and the token and time chart, in one
  self-contained file. **Open report page** is the first button in What you got.
- **Evals.** `evals/` holds four cases (two full builds, a change request on an
  empty folder, a plain question that must not trigger anything) for
  `claude plugin eval`.
- **CI.** A GitHub Action validates and tests the plugin on every push, and
  runs the evals weekly and on demand.

### Changed
- The pane's header names a change request and the base run; `show` prints the
  run folder on its first lines, and the `init` reply names it.
- `What you got` opens the run folder, not `.briefproof/`.
- `show` reports token usage live, including requests made since the last
  ledger write.

### Fixed
- Token usage from earlier sessions was dropped on resume, and a second run in
  the same session inherited the first run's count. The budget bar, `show`,
  the stats and the report page were all affected. Reported by @mattabate (#1).
- A ticket whose title contains "review" was taken for a reviewer's spawn.
- Ticket requirement ids were not escaped in the report page.
- `0.5M` in the budget field was read as 1 token.

## 0.8.0 · 2026-11-01

The pane tells the truth, you stay in control, and a run leaves a folder a
person can read.

### Added
- **Subagent mirroring.** The mod watches the `Agent` calls the orchestrator
  makes. A subagent spawned for a ticket marks it running; its `DONE`,
  `DONE_WITH_NOTES` or `BLOCKED` report moves the ticket to review, done, or
  logs the block. The pane is right even when the agent forgets `set_ticket`.
- **Token budget per run** (setting, default off). The pane shows a bar towards
  it; crossing it stops new tickets, both through the ledger and at the spawn,
  until you press **Continue anyway**. Toast and desktop notification when it
  happens.
- **Resume.** Opening Claude Code in a folder with an unfinished run shows
  "Interrupted at <stage>" with a Resume button that runs `/briefproof:build`.
- **Stage folders.** Everything a run writes lands in `.briefproof/` under
  `1-brief/` … `8-report/`, numbered the way the pane numbers the stages.
- **Files the mod writes itself:** `2-manifest/requirements.md` (quotes, status,
  your reason for anything set aside; rewritten on every change) and
  `3-briefing/answers.md` (every question asked and what you answered).
- **Files the skill now saves:** reviewer replies in `6-build/`, the blind
  checker's verdict in `7-acceptance/acceptance.md`, the report in
  `8-report/report.md`, and `3-briefing/decisions.md` in auto mode.
- **What you got.** When a run is done, the pane lists the stage folders with
  file counts, with **Open folder** (Finder, Explorer or `xdg-open`) and **Copy
  path**. In the terminal the names are `file://` links.
- **Minutes per stage** in the end chart and in `show`, from a timeline the
  ledger keeps.
- **Tickets in waves.** Each ticket owns its files; non-overlapping tickets run
  in parallel, three at a time.
- **Pause holds the spawn too**, not only `set_ticket`.
- `fable` in every stage's model picker.
- **Capybara** setting (default on) for a pane without the picture.
- A plugin icon, `displayName`, `homepage` and `repository` in the manifest.

### Changed
- The pane's scene is a square beside a caption on every stage, with a different
  capybara per stage (reading, writing, speech bubble, glasses, tickets,
  running, magnifying glass, hot spring) and a line of character.
- Stage 8 is labelled "Done (report)" in the settings to match the pane.
- No long dashes anywhere in user-facing text.

### Fixed
- The pane's "answer in the dialog on the left" assumed a docked pane.
- A stale toast still said questions were answered in the pane.

## 0.7.0 · 2026-10-19

First public version.

- `/briefproof:build`: brief → verbatim requirements → one round of questions
  (Claude Code's own dialog, suggested answer first) → spec → tickets → one
  fresh subagent per ticket, reviews where it pays → blind acceptance check by
  an agent that has only seen the brief → plain-language report.
- The `state` ledger tool: the only writer of `.briefproof/state.json`; refuses
  to drop a requirement without the user's words, to pass a gate with open
  problems, or to start a ticket while paused.
- The pane: capybaras, the question mirror, requirements you can defer, drop or
  add in your own words, pause/resume, notifications.
- A model per stage, enforced on every request of that stage, with token usage
  per stage and a chart at the end.