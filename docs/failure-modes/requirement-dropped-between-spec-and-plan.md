# A requirement is in the spec but missing from the plan

## The symptom

The spec mentions what you asked for, but no ticket in the plan builds it.
Every ticket gets finished, the agent says "done", and nobody can say where
that requirement went.

## What catches it

The plan gate, and the rule **gates the agent can't talk its way past**. Every
ticket names the requirements it serves, and before the build starts the run
ledger checks the trace in both directions: every requirement in the spec is in
a ticket, and every ticket traces to a requirement. The ledger refuses to mark
the gate passed while one is missing, so the gap is found before any code is
written, not after.

If something slips through anyway, the blind checker at the end reads only your
brief, so a requirement that was never built shows up there as a `✗`.

Back to the README: [Claude Code says done but a requirement is missing](../../README.md#claude-code-says-done-but-a-requirement-is-missing)
