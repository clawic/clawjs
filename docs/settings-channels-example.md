# Settings Channels Example

This example focuses on the settings surface most integrations need first:

- list every channel
- group them by status
- expose what is connected, what is only configured, and what is still missing

Run [`../examples/settings-channels-example.ts`](../examples/settings-channels-example.ts) to model a local-only integrations page with normalized channel descriptors.

Key API surface:

- `claw.channels.list()`
- `claw.scheduler.list()`
