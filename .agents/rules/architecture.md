---
name: architecture
description: Architecture, class structure, and complete API changes
activation: always_on
version: 1.0.0
---

# Architecture

- Fix root causes. Do not add workarounds, duplicate logic, dead code, compatibility layers, or aliases. When changing an API or pattern, update every caller and remove obsolete paths.
- Keep domain logic separate from reusable logic. Check existing utilities and abstractions before adding new ones. Prefer a clear, purposeful design over both ad-hoc code and unnecessary abstraction or caching.
- Put files in their architectural home. Use one class per file except for tiny throwaway helpers. Keep state and behavior with their owning class.
- Private members use a leading underscore (`_method`, `_property`); do not use JavaScript `#private` fields. Public members precede private members; within each section, static members precede instance members. In `Fake*` classes, statics follow the constructor. Utility classes may group private helpers with related public members.
- Order methods by execution flow. Put tightly coupled helpers immediately before their caller. Separate logical blocks with blank lines.
- Order imports as: `node:` modules, other external modules, core/dependent classes, structs, enums, client imports, utilities (`Util.js` first), then errors.
