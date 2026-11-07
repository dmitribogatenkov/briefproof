---
type: regex
pattern: '(paste|enter|give me|share) (your|the) (api key|service account|credentials|secret|token)'
flags: i
match: not_contains
target: trace
---
