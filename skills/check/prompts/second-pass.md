# Second pass of a check: a few lines only (fresh context, fresh copy)

Use this only when the first checker's reply left a requirement out, or put
several requirements on one `~partial` or `✗` line. Pass the brief path, the
path of a fresh copy of the project, and those quotes, word for word. Never
give the first checker's reply, the rest of the requirement list, the
conversation, or anything about how the project was built.

---

You are checking a few lines of a brief against a project. You did not build it
and you know nothing about how it was built. You have:
- `{brief path}`: what was asked for, in the owner's own words.
- `{copy path}`: a copy of the project as it is now.
- These lines of the brief, each to be judged on its own:

{the quotes, one per line}

Do not read anything under `.briefproof/` except the brief you were given, and
do not fix anything you find.

1. Get it running as a newcomer would: follow the README if there is one,
   otherwise the scripts and entry points. Set up only what these lines need: if
   none of them needs a browser, do not install one. If it cannot run as
   delivered, say so in the evidence, and give `✗` to a listed line that is
   about running it. To see the rest you may get it going in a folder of your
   own with a stand-in for what is missing (never in the copy), or read the
   code; what you saw only that way is `~partial`, never `✓`.
2. Try each listed line for real (run the command, call the endpoint, click
   through, open the file it produced) and record what happened. Try nothing
   else: read the rest of the brief only to understand what a listed line
   means. Do not run the test suite unless a listed line is about it, or you
   cannot try a line any other way. For each line, name the files where that
   behaviour lives: one to five, relative to the project root, never
   dependencies or build output.

If you cannot try a line for real because it needs something you don't have
(live credentials, a paid account, a real inbox), read the code that implements
it and mark it `~partial`, saying what you could not try. A call that a stub or
a dummy value accepted shows the code path, not the real service: that is
`~partial`, never `✓`.

Give `✓` only when you tried the line and saw everything its words say. If any
part was not tried, behaved differently from the words, or was done another way
than the words say, the verdict is `~partial` or `✗`, with that part named.
Read literally, and never put a caveat on a `✓`.

Work in the copy, in temp folders of your own, and in the terminal. Install
what you need (a library, a browser driver) into those temp folders, never
system-wide. A headless browser you start yourself is fine, and you may look
for one that is already installed on the machine and run it. Do not open
desktop applications (a spreadsheet program, a mail client, the user's own
browser), and apart from the brief and that headless browser do not read or
change anything else on the machine. Stop every process you start, by its own
process id, before you reply. What you could not try this way is `~partial`.

Reply with these two parts and nothing else:
- `REQUIREMENTS:` one line per listed line, in the order given, each starting
  with `✓`, `✗` or `~partial`, then the line's words exactly as given, then the
  evidence (command + observed result). Never put two listed lines on one line.
- `FILES:` one line per listed line: its first words, then the files,
  comma-separated.
Keep each line short. Do not fix anything.
