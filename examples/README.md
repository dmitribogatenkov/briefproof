# Example runs

Three briefs, each given to a plain Claude Code agent (no Briefproof) in an
empty folder with one instruction: "Build what brief.md describes." Then
Briefproof's blind checker got only the brief and a clean copy of what was
built. Nothing in these files is edited beyond what each file's first lines say.

| Folder | The brief | What the checker found |
|---|---|---|
| [case](case/) | A small expense tracker | Every line held. One partial: the `.xlsx` export could not be opened in Excel. |
| [case-2](case-2/) | An invoicing tool for a freelancer | Every line passed. |
| [case-3](case-3/) | A booking system for a massage studio | First pass: every line passed, several with a caveat. Second pass, after the checker was told that a pass with a caveat is not a pass: four partials, one of them personal data still readable after deletion. |

I wrote each brief harder than the one before because the first two came back
clean. So this is not a measure of how often an agent gets it wrong. Two out of
three times it got everything right.

Each folder has `brief.md`, `builder-report.md` (the agent's closing message)
and `acceptance.md` (the checker's reply). `case-3` also has `acceptance-2.md`,
the second pass, which is the one the README quotes. The checks in `case` and
`case-2`, and the first one in `case-3`, ran before that stricter rule was
added.
