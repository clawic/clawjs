import test from "node:test";
import assert from "node:assert/strict";

import { buildRuntimeCapabilityMap, defaultManagedConversationFeatures, openClawMirrorFeatures } from "./shared.ts";

test("buildRuntimeCapabilityMap normalizes unsupported capability invariants", () => {
  const capabilityMap = buildRuntimeCapabilityMap({
    conversation_gateway: {
      supported: true,
      status: "unsupported",
      strategy: "gateway",
    },
    channels: {
      supported: false,
      status: "ready",
      strategy: "config",
    },
  });

  assert.deepEqual(capabilityMap.conversation_gateway, {
    supported: false,
    status: "unsupported",
    strategy: "unsupported",
  });
  assert.deepEqual(capabilityMap.channels, {
    supported: false,
    status: "unsupported",
    strategy: "unsupported",
  });
});

test("feature descriptor helpers declare ownership and conversation policy", () => {
  const managed = defaultManagedConversationFeatures({
    channelsSupported: true,
    skillsSupported: true,
  });
  const mirrored = openClawMirrorFeatures(buildRuntimeCapabilityMap({
    channels: { supported: true, status: "ready", strategy: "config" },
    skills: { supported: true, status: "ready", strategy: "native" },
    plugins: { supported: true, status: "ready", strategy: "native" },
    memory: { supported: true, status: "ready", strategy: "native" },
    scheduler: { supported: true, status: "ready", strategy: "native" },
  }));

  assert.equal(managed.find((feature) => feature.featureId === "models")?.ownership, "sdk-owned");
  assert.equal(managed.find((feature) => feature.featureId === "conversations")?.conversationPolicy, "managed");
  assert.equal(mirrored.find((feature) => feature.featureId === "conversations")?.conversationPolicy, "mirror");
  assert.equal(mirrored.find((feature) => feature.featureId === "plugins")?.supported, true);
});
