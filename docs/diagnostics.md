---
title: Diagnostics & Repair
description: Compat refresh, doctor reports, and the adapter-aware repair workflow.
---

# Diagnostics & Repair

ClawJS diagnostics are centered around `claw.compat` and `claw.doctor`.
They are adapter-aware and include the typed capability map rather than
just a boolean health flag.

## Compat refresh

```ts
const snapshot = await claw.compat.refresh();
console.log(snapshot.runtimeAdapter);
console.log(snapshot.capabilityMap);
```
Refreshing compat also updates persisted runtime-derived state snapshots
for scheduler, memory, skills, and channels.

## Doctor

```ts
const report = await claw.doctor.run();
console.log(report.ok);
console.log(report.issues);
console.log(report.suggestedRepairs);
```
Doctor combines:

- adapter-specific runtime doctor output
- workspace validation
- compat drift
- auth/provider summaries
- managed block problems
- snapshot-backed subsystem state

For the deeper repo-facing explanation of auth, compat drift, and doctor reports, see [Auth, Compat, and Doctor](/auth-compat-and-doctor).
