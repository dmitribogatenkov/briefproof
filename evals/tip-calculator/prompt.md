---
max_turns: 200
timeout_seconds: 3600
allowed_tools: [Read, Glob, Grep, Write, Edit, Bash, Agent, Skill, AskUserQuestion, TodoWrite, mcp__briefproof__state]
tags: [smoke, build]
---

/briefproof:build auto A one-page tip calculator: enter the bill, pick a tip percent, split it between people, and see what each person pays. Works offline, no sign-up.
