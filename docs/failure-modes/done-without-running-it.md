# Claude Code says done without running the code

## The symptom

The agent wrote the code, read it back, and declared it finished. The project
was never installed or started, so the first person to run it is you.

## What catches it

The Acceptance stage. The agent that built the project is not allowed to grade
it. A fresh subagent gets a clean clone, so nothing that only exists on the
builder's side can help, and follows the README from the first step: install,
configure, run. The first line of its verdict is whether the project runs, with
the exact command that failed if it doesn't. Every requirement line after that
carries the command it ran and what it saw.

Later, the rule **the proof knows when it is stale** covers the same failure
over time. Each verified requirement names the files it lives in, and when one
of them changes the pane says which requirements may be stale and offers a
re-check, which runs the project again.

Back to the README: [Claude Code says done but a requirement is missing](../../README.md#claude-code-says-done-but-a-requirement-is-missing)
