---
name: clean-code
description: Apply this repository's engineering standards when planning, implementing, refactoring, or reviewing code.
activation: always_on
version: 1.0.0
---

# Clean Code

Use the rules in `.agents/rules` as the repository standard. Before changing code, trace ownership, callers, and existing utilities; choose a design consistent with user intent and established patterns. Implement the full change without workarounds or compatibility debris, then review the complete diff and correct gaps. Add focused coverage for behavior changes and report verification accurately. Keep the solution readable, cohesive, and no broader than needed to resolve the underlying design correctly.
