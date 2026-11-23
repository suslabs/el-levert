---
name: configuration
description: Config defaults and schema consistency
activation: always_on
version: 1.0.0
---

# Configuration

- Update the schema whenever a config option is added, changed, or removed.
- Real operational defaults belong in `config.json`, not `DefaultConfig`. `DefaultConfig` contains only neutral base values needed by `ConfigLoader.modify` to safely perform parsing or arithmetic on missing values. Remove unnecessary base values.
