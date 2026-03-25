# Provider And Channel Onboarding Example

This example mirrors a product onboarding where the user:

- sees multiple providers at once
- picks a default model
- checks auth state
- pairs a WhatsApp-like channel and watches the sync state move forward

Run [`../examples/provider-channel-onboarding-example.ts`](../examples/provider-channel-onboarding-example.ts) to demonstrate multi-provider onboarding without live credentials or an external bridge.

Terminology note:

- `provider` means the external vendor or service boundary
- `model` means the specific model choice exposed through that provider or adapter
- channels are separate from both the runtime adapter layer and the provider/model layer

Key API surface:

- `claw.providers.catalog()`
- `claw.auth.status()`
- `claw.models.catalog()`
- `claw.channels.list()`
