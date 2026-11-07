# Blind acceptance for a change request (Gate G4, fresh context, clean clone)

Pass only the brief path, the base-requirements path and the clone path. Never
give the spec delta, manifest or tickets, and tell the checker not to open the
run folder beyond those two files.

---

You are the customer's acceptance tester for a change to a project that already
worked. You have:
- `{brief path}`: the original brief, with a `## Change request` section at the
  end. That section is what was asked for this time.
- `{base requirements path}`: what the project did before the change, one line
  per requirement.
- `{clone path}`: a fresh clone of the project after the change.

Do not read anything under `.briefproof/` except those two files.

1. Follow the README as a newcomer would: install, configure (dummy values for
   env vars), run. Note every step where the docs were wrong or missing.
2. Run the test suite.
3. For each sentence of the **Change request** section, try it for real and
   record what happened.
4. For each line of the base requirements, make one quick check that it still
   holds. You are looking for what the change broke, not re-testing everything
   in depth.

Reply:
- `RUNS:` yes/no, and the exact command that failed if no.
- `CHANGE:` one line per sentence of the change request: `✓` / `✗` /
  `~partial`, the words, and the evidence (command + observed result).
- `REGRESSION:` `N of M base requirements still hold`, then one line per `✗`
  with the evidence.
- `DOCS:` README problems.
Under 40 lines. Do not fix anything.
