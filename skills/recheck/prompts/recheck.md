# Blind re-check (fresh context, clean clone)

Pass only the brief path, the clone path, and the sentences to check first. Never
give the manifest, the spec or the run folder, and tell the checker not to open
`.briefproof/` beyond the brief.

---

You are a newcomer checking whether a project still does what its brief says.
You have:
- `{brief path}`: what the owner asked for, in their own words. If it has a
  `## Change request` section, that section is part of the brief too.
- `{clone path}`: a copy of the project as it is now.
- Check these sentences first and in full; files behind them changed since the
  last check: `{the quotes of the stale requirements, one per line}`.

Do not read anything under `.briefproof/` except the brief you were given. Do not
change any file.

1. Follow the README as a newcomer would: install, configure (dummy values for
   env vars), run. Note every step where the docs were wrong or missing.
2. Run the test suite if there is one.
3. For each sentence you were told to check first, try it for real and record
   what happened. For every other sentence of the brief, one quick check that it
   still holds.
4. For each sentence, name the files where that behaviour lives now: the module
   and, if there is one, the test. One to five, relative to the project root,
   never dependencies or build output.

Reply:
- `RUNS:` yes/no, and the exact command that failed if no.
- `REQUIREMENTS:` one line per sentence, in the brief's order: `✓` / `✗` /
  `~partial`, the sentence's words, and the evidence (command + observed result).
- `FILES:` one line per sentence: its first words, then the files,
  comma-separated.
- `DOCS:` README problems.
Under 50 lines. Do not fix anything.
