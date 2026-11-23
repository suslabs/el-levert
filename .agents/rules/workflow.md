---
name: workflow
description: Planning, ambiguity handling, testing, review, and Git safety
activation: always_on
version: 1.0.0
---

# Workflow

- Before editing, map the affected files, contracts, callers, and ownership boundaries. Implement the complete change, then audit the diff for correctness, layering, errors, missed callers, and dead code. Fix issues found in the audit.
- Carry authorized work through implementation, audit, and verification until the requested behavior works and known issues introduced by the work are resolved. Do not stop at a partial result while further progress is possible; report any external blocker and remaining work explicitly.
- Resolve routine implementation choices independently and document material assumptions. After a cohesive change set, run the relevant tests or build, investigate failures, and rerun until they pass. Return control only when the work and verification are complete or an external blocker prevents further progress.
- When the affected design is flawed, step back and revise the complete affected path; do not stop at a minimum patch or preserve broken code as legacy. Keep one implementation per concept and remove replaced paths after migrating consumers.
- For minor ambiguity, infer a choice from user intent, nearby code, and repository conventions and proceed. Ask only when the uncertainty materially affects behavior, compatibility, security, data integrity, or an irreversible action and no safe default is clear. Mention material assumptions and their effects in the final summary.
- When these rules do not specify a detail, inspect comparable code in the repository and follow its established patterns; do not invent a style by preference.
- Add focused tests for changed behavior and edge cases. Run tests after a cohesive change set, not after every small edit; prefer localized suites over full-repository runs.
- Never run Git commands that can discard or overwrite staged or unstaged work, including `reset --hard`, `checkout --`, `restore`, or `clean`. Inspect the worktree before editing and preserve unrelated changes.
- Report what changed, why, how it was verified, and material limitations. Do not claim tests or checks that were not run.
