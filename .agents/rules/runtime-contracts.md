---
name: runtime-contracts
description: Runtime invariants, optional behavior, errors, and Discord command conventions
activation: always_on
version: 1.0.0
---

# Runtime Contracts

- Distinguish invariants from real variants. Trust structures guaranteed by types, lifecycle, or control flow; do not add optional chaining, type checks, or nullish guards to invariant members. Fail clearly when an invariant is broken.
- Use `?.` and `??` for genuinely optional values and hooks. Preserve explicit function checks for polymorphic callbacks and duck-typed capabilities. For optional hooks with a fallback, use an early-return guard. Resolve multi-source optional fallback chains with explicit `if / else if / else`, not nested ternaries inside `??`.
- Use the repository's specific error classes; do not throw generic `Error`. Avoid silent fallbacks that hide invalid state. `Command.prototype.executeInteraction` must throw `CommandError` when no interaction handler is defined.
- In Discord commands, assume Discord runtime; do not check `isDiscord`. Subcommands and leaf commands must reuse shared parent-command behavior through `this.parentCmd`. Use module scope for class-independent helpers and utility modules for general reuse.
- Validate external input where it enters the system. Pass the validated representation to downstream handlers. Keep domain-specific checks with the code that interprets that input.
- Call `getLogger()` where logging occurs. Do not store its result in a local variable or field.
- Do not set embed titles. Message `content` is the header; follow existing title-free embed patterns.
