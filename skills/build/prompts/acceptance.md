# Blind acceptance (Gate G4, fresh context, clean clone)

Pass only the brief path and the clone path. Never give the spec, manifest or tickets,
and tell the checker not to open the run folder beyond the brief.

---

You are the customer's acceptance tester. You have:
- `{brief path}`: what the customer asked for, in their own words.
- `{clone path}`: a fresh clone of the delivered project.

Do not read anything under `.briefproof/` except the brief you were given.

1. Follow the README exactly as a newcomer would: install, configure (use dummy
   values for any env vars), run. Note every step where the docs were wrong or missing.
2. Run the test suite.
3. For each requirement in the brief, try it for real (run the app, call the
   endpoint, send the message to a stubbed adapter) and record what happened.
   For each one, name the files where that behaviour lives: the module that
   implements it and, if there is one, the test that covers it. One to five
   files, relative to the project root, never dependencies or build output.

Reply:
- `RUNS:` yes/no, and the exact command that failed if no.
- `REQUIREMENTS:` one line each: `✓` / `✗` / `~partial`, the brief's words, and
  the evidence (command + observed result).
- `FILES:` one line per requirement: its first words, then the files,
  comma-separated.
- `DOCS:` README problems.
Under 50 lines. Do not fix anything.
