# Blind check of an existing project against a brief (Gate G4, fresh context, clean copy)

Pass only the brief path and the copy path. Never give the requirement list,
the conversation, or anything about how the project was built, and tell the
checker not to open `.briefproof/` beyond the brief.

For a second pass on lines the first reply left out or merged, do not send this
prompt again: use `second-pass.md`, which tries only those lines.

---

You are checking whether a project does what its brief asks. You did not build
it and you know nothing about how it was built. You have:
- `{brief path}`: what was asked for, in the owner's own words.
- `{copy path}`: a copy of the project as it is now.

Do not read anything under `.briefproof/` except the brief you were given. Work
only inside the copy, and do not fix anything you find.

1. Get it running as a newcomer would: follow the README if there is one,
   otherwise the scripts and entry points. Install, configure (dummy values for
   env vars), run. Note every step where the docs were wrong or missing. If it
   cannot run as delivered, say so, and give `✗` to what the brief says about
   running it. To see the rest you may get it going in a folder of your own with
   a stand-in for what is missing (never in the copy), or read the code and run
   the tests; what you saw only that way is `~partial`, never `✓`.
2. Run the test suite if there is one. A passing test is a hint, not a verdict:
   the brief is what you check against.
3. Go through the brief sentence by sentence. For each thing it asks the project
   to do or to be, try it for real (run the command, call the endpoint, click
   through, open the file it produced) and record what happened. For each one,
   name the files where that behaviour lives: the module that implements it and,
   if there is one, the test that covers it. One to five files, relative to the
   project root, never dependencies or build output.

If you cannot try a requirement for real because it needs something you don't
have (live credentials, a paid account, a real inbox), read the code that
implements it, run its tests, and mark it `~partial`, saying what you could not
try. A call that a stub or a dummy value accepted shows the code path, not the
real service: that is `~partial`, never `✓`.

Give `✓` only when you tried the requirement and saw everything its words say.
If any part was not tried, behaved differently from the words, or was done
another way than the words say, the verdict is `~partial` or `✗`, with that
part named. Read literally: if the brief says "notify the owner" and the project
only logs, that is not a `✓`. Never put a caveat on a `✓`.

Work in the copy, in temp folders of your own, and in the terminal. Install
what you need (a library, a browser driver) into those temp folders, never
system-wide. A headless browser you start yourself is fine, and you may look
for one that is already installed on the machine and run it. Do not open
desktop applications (a spreadsheet program, a mail client, the user's own
browser), and apart from the brief and that headless browser do not read or
change anything else on the machine. Stop every process you start, by its own
process id, before you reply. What you could not try this way is `~partial`.

Reply:
- `RUNS:` yes/no, and the exact command that failed if no.
- `REQUIREMENTS:` one line per thing the brief asks, in the brief's order, each
  starting with `✓`, `✗` or `~partial`, then the brief's own words for it, then
  the evidence (command + observed result). A sentence that asks for several
  things gets one line for each, with the verdict and evidence for that part
  alone: "sends a weekly summary by email, in Estonian, every Monday" is three
  lines. Do not merge several into one, however long the brief is.
- `FILES:` one line per requirement: its first words, then the files,
  comma-separated.
- `DOCS:` problems with the README or setup, five lines at most.
Keep each line short. Do not fix anything.
