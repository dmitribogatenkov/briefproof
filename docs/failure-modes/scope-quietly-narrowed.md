# Claude Code quietly narrowed the scope

## The symptom

Part of what you asked for turned out to be hard, so the agent built the easy
part and left the rest out. Nothing in the final message says so, or it is one
line near the bottom that reads like a detail.

## What catches it

The rule that **nothing leaves the list without your own words saying why**.
Only you can defer or drop a requirement, and the run ledger refuses the change
unless it comes with your reason. The agent has no way to retire one on its
own: if the build proves the spec wrong, it amends the spec and logs why, and
the requirement stays.

The two independent checks cover the quieter version, where a requirement
stays on the list but is built smaller than you wrote it. Both compare against
your brief read literally, first the spec and then the finished project, so
"the easy half" comes back as partial, not as done. In `auto` mode, where
nothing is asked, every decision the agent made is listed in the final report.

Back to the README: [Claude Code says done but a requirement is missing](../../README.md#claude-code-says-done-but-a-requirement-is-missing)
