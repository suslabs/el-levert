---
name: architecture
description: Architecture, class structure, and complete API changes
activation: always_on
version: 1.0.0
---

# Architecture

- Fix root causes. Do not add workarounds, duplicate logic, dead code, compatibility layers, or aliases. Keep one source of truth for each concept; do not create parallel state, calculations, validation, or behavior. When changing an API or pattern, update every caller and remove obsolete paths.
- Do not stop at the smallest patch when the affected design is flawed. Replace the affected path with a coherent design, migrate its callers and persisted representation, and remove the obsolete implementation. Keep the scope centered on that subsystem, but complete the required refactor instead of treating broken existing code as legacy to preserve.
- Keep domain logic separate from reusable logic. Check existing utilities and abstractions before adding new ones. Prefer a clear, purposeful design over both ad-hoc code and unnecessary abstraction or caching.
- Put files in their architectural home. Use one class per file except for tiny throwaway helpers. Keep state and behavior with their owning class.
- Use unexported top-level functions for helpers that are local to one module and independent of its classes. Keep a helper on its class when it depends on the instance or on class-owned constants, state, or behavior. Use an instance method for instance behavior and a private static method for class-level behavior. Put generally reusable helpers in the appropriate utility module. In util-style `Object.freeze({...})` objects, keep all functions and helper variables inside the frozen object itself — do not declare outer helper functions or top-level variables outside it.
- Private members use a leading underscore (`_method`, `_property`); do not use JavaScript `#private` fields. Public members precede private members; within each section, static members precede instance members. In `Fake*` classes, statics follow the constructor. Utility classes may group private helpers with related public members.
- Order methods by execution flow. Put tightly coupled helpers immediately before their caller. Separate logical blocks with blank lines.
- Order imports as: `node:` modules, other external modules, core/dependent classes, structs, enums, client imports, utilities (`Util.js` first), then errors.
