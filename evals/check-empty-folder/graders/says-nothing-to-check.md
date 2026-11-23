---
type: llm
---

The workspace is empty: there is no project to check.

PASS if the final reply is short (under 80 words), says the folder has no project or source files to check, and points the user to /briefproof:build to start one from a brief.
FAIL if the reply starts a check, invents a project, builds anything, calls the ledger, or writes any files.
