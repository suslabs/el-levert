---
name: code-style
description: JavaScript style, repository utilities, data conventions, and SQL formatting
activation: always_on
version: 1.0.0
---

# Code Style

- Format changed code with Prettier. Keep edits scoped to relevant files and write readable, direct code without obfuscation.
- Prefer `const`. Group declarations only when the variables share a clear purpose; put distinct concerns in separate declaration blocks with a blank line between them. Normalize input parameters in place at function entry rather than creating aliases.
- Use short, descriptive names consistent with nearby code; use `i` for loop counters and `idx` for other indices.
- Use a single-layer ternary for a clear two-way expression. Keep complex or multiline branches as `if / else`; chain mutually exclusive conditions with `else if`. Use `switch` for enum alternatives.
- At function entry, normalize options with `options = ObjectUtil.guaranteeObject(options);`. Give optional options reasonable defaults in a local binding with `??`.
- Check `src/util` before implementing common behavior. Use `Util.first` for a clear, single first-element access. Use `Util.empty` for empty strings and collections; never use collection helpers on numbers. Do not compare strings to `""` or collection lengths to zero as an emptiness check.
- Do not check `=== undefined`; use `typeof value === "undefined"`. Prefer a strict `null` or `undefined` check when only one is possible; use `== null` only when both are valid possibilities.
- Freeze enums with `Object.freeze`, shallowly. Use `Util.durationSeconds` for time constants; do not hardcode milliseconds or seconds. Keep SQL indentation at four spaces, with compact simple queries and balanced formatting for complex ones.
- Avoid dead wrappers and variables. Do not add comments that merely restate the code.
