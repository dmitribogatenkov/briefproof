# Changelog

All notable changes to Briefproof. The version is the `version` field in
`.claude-plugin/plugin.json`; `claude plugin update briefproof@briefproof`
picks up a new one.

## 0.8.0 · 2026-11-01

The pane tells the truth, you stay in control, and a run leaves a folder a
person can read.

### Added
- **Subagent mirroring.** The mod watches the `Agent` calls the orchestrator
  makes. A subagent spawned for a ticket marks it running; its `DONE`,
  `DONE_WITH_NOTES` or `BLOCKED` report moves the ticket to review, done, or
  logs the block. The pane is right even when the agent forgets `set_ticket`.
- **Token budget per run** (setting, default off). The pane shows a bar
  towards it; crossing it stops new tickets, both through the ledger and at the
  spawn, until you press **Continue anyway**. Toast and desktop notification
  when it happens.
- **Resume.** Opening Claude Code in a folder with an unfinished run shows
  "Interrupted at <stage>" with a Resume button that runs `/briefproof:build`.
- **Stage folders.** Everything a run writes lands in `.briefproof/` under
  `1-brief/` … `8-report/`, numbered the way the pane numbers the stages.
- **Files the mod writes itself:** `2-manifest/requirements.md` (quotes,
  status, your reason for anything set aside; rewritten on every change) and
  `3-briefing/answers.md` (every question asked and what you answered).
- **Files the skill now saves:** reviewer replies in `6-build/`, the blind
  checker's verdict in `7-acceptance/acceptance.md`, the report in
  `8-report/report.md`, and `3-briefing/decisions.md` in auto mode.
- **What you got.** When a run is done, the pane lists the stage folders with
  file counts, with **Open folder** (Finder, Explorer or `xdg-open`) and
  **Copy path**. In the terminal the names are `file://` links.
- **Minutes per stage** in the end chart and in `show`, from a timeline the
  ledger keeps.
- **Tickets in waves.** Each ticket owns its files; non-overlapping tickets run
  in parallel, three at a time.
- **Pause holds the spawn too**, not only `set_ticket`.
- `fable` in every stage's model picker.
- **Capybara** setting (default on) for a pane without the picture.
- A plugin icon, `displayName`, `homepage` and `repository` in the manifest.

### Changed
- The pane's scene is a square beside a caption on every stage, with a
  different capybara per stage (reading, writing, speech bubble, glasses,
  tickets, running, magnifying glass, hot spring) and a line of character.
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
- The pane: capybaras, the question mirror, requirements you can defer, drop
  or add in your own words, pause/resume, notifications.
- A model per stage, enforced on every request of that stage, with token usage
  per stage and a chart at the end.
