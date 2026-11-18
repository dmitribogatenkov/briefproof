# Claude Code paraphrased my requirement into something easier

## The symptom

You wrote a specific requirement, and the agent restated it in its own words
on the way to the spec. The restated version is close, a little easier to
build, and it is the one that gets built and reported as done.

## What catches it

The rule **requirements are quoted, never paraphrased**. In the Manifest stage
your brief is split into numbered requirements (`R01…`) that keep your exact
words, so there is no rewritten version for later stages to work from.

Then two readers who never saw the rewrite compare against your text:

- After the spec, a fresh subagent gets only the brief and the spec and reads
  literally. If the brief says "notify the owner" and the spec only logs, it
  reports that as partially covered, and the spec is fixed before any plan
  exists.
- After the build, the blind checker gets only the brief and a clean clone of
  the project, and checks each sentence of the brief as you wrote it.

Back to the README: [Claude Code says done but a requirement is missing](../../README.md#claude-code-says-done-but-a-requirement-is-missing)
