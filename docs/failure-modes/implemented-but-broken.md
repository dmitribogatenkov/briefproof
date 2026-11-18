# Claude Code implemented the feature but it doesn't work

## The symptom

The code for the requirement exists, and the agent points at it as proof. When
you try the feature yourself, it fails or does something else.

## What catches it

The Acceptance stage, and the rule **the checks are independent**. The blind
checker doesn't only read the code. It takes a clean clone, follows the README
like a newcomer, runs the tests, and then tries each sentence of your brief for
real: runs the app, calls the endpoint. Each line gets `✓`, `✗` or `~partial`
with the command it ran and what it saw.

A requirement that exists but fails is a `✗` with the evidence, the same as one
that is missing. It becomes a fix ticket and is checked again, and a requirement
only counts as done on the checker's `✓`. What the checker cannot try for real,
such as anything that needs live credentials, it reads and runs the tests for,
and reports as partial rather than passing.

Back to the README: [Claude Code says done but a requirement is missing](../../README.md#claude-code-says-done-but-a-requirement-is-missing)
