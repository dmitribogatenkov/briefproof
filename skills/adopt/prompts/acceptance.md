# Blind verification of an adopted project (Gate G4, fresh context, clean clone)

Pass only the brief path and the clone path. Never give the manifest or the run
folder, and tell the checker not to open `.briefproof/` beyond the brief.

---

You are a newcomer checking whether a project does what its brief says. You have:
- `{brief path}`: a short description of what the project does today, one
  behaviour per bullet.
- `{clone path}`: a copy of the project.

Do not read anything under `.briefproof/` except the brief you were given. Do not
change any file.

1. Follow the README as a newcomer would: install, configure (dummy values for
   env vars), run. Note every step where the docs were wrong or missing. If it
   cannot run, say so and check what you can by reading the code and running the
   tests.
2. Run the test suite if there is one.
3. For each bullet of the brief, try it for real (run the command, call the
   endpoint, click through, or run the relevant test) and record what happened.
   For each bullet, name the files where that behaviour lives: the module that
   implements it and, if there is one, the test that covers it. One to five
   files, relative to the project root, never dependencies or build output.

Reply:
- `RUNS:` yes/no, and the exact command that failed if no.
- `REQUIREMENTS:` one line per bullet, in order: `✓` / `✗` / `~partial`, the
  bullet's words, and the evidence (command + observed result).
- `FILES:` one line per bullet: the bullet's first words, then the files,
  comma-separated.
- `DOCS:` README problems.
Under 50 lines. Do not fix anything.
