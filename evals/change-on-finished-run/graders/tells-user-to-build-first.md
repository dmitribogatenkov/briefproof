---
type: llm
---

The workspace is empty: there is no finished Briefproof run to change.

PASS if the final reply is short (under 80 words), says there is no finished run or base project in this folder, and points the user to /briefproof:build first. Mentioning that they can run /briefproof:change again afterwards is fine.
FAIL if the reply starts building, invents or assumes a base project, asks the user questions about the change, or writes any files.
