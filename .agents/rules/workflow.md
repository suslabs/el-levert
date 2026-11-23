---
name: workflow
description: Planning, ambiguity handling, testing, review, and Git safety
activation: always_on
version: 1.0.0
---

# Workflow

- Before editing, map the affected files, contracts, callers, and ownership boundaries. Implement the complete change, then audit the diff for correctness, layering, errors, missed callers, and dead code. Fix issues found in the audit.
- For minor ambiguity, infer a choice from user intent, nearby code, and repository conventions and proceed. Ask only when the uncertainty materially affects behavior, compatibility, security, data integrity, or an irreversible action and no safe default is clear. Mention material assumptions and their effects in the final summary.
- Add focused tests for changed behavior and edge cases. Run tests after a cohesive change set, not after every small edit; prefer localized suites over full-repository runs.
- Never run Git commands that can discard or overwrite staged or unstaged work, including `reset --hard`, `checkout --`, `restore`, or `clean`. Inspect the worktree before editing and preserve unrelated changes.
- Report what changed, why, how it was verified, and material limitations. Do not claim tests or checks that were not run.
