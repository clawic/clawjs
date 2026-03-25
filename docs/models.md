---
title: Models
description: Understand the normalized model catalog and adapter-specific default model behavior.
---

# Models

The models layer is adapter-driven. ClawJS exposes a normalized catalog,
but each adapter decides how model discovery and default model mutation
really work.

In canonical ClawJS terminology, a `provider` is the external vendor or
service boundary, while a `model` is the specific selectable model
surfaced through that provider or adapter. Do not use them as synonyms.

## Main APIs

- `claw.models.list()`
- `claw.models.catalog()`
- `claw.models.getDefault()`
- `claw.models.setDefault(model)`

## Model catalogs

```ts
const catalog = await claw.models.catalog();

console.log(catalog.models);
console.log(catalog.defaultModel);
```
`setDefault()` does not assume one fixed provider mapping. It delegates
to the active adapter.

## Examples of adapter differences

- **OpenClaw:** normalizes \`models status --json\`
- **ZeroClaw:** separates provider and model catalog inspection
- **PicoClaw:** derives provider information from its model and config
  surfaces
