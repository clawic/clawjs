import type { RuntimeAdapter } from "../contracts.ts";
import type { RuntimeAdapterId } from "@clawjs/core";
import { demoAdapter } from "./demo-adapter.ts";
import { openclawAdapter } from "./openclaw-adapter.ts";
import { nanobotAdapter } from "./nanobot-adapter.ts";
import { nanoclawAdapter } from "./nanoclaw-adapter.ts";
import { nullclawAdapter } from "./nullclaw-adapter.ts";
import { ironclawAdapter } from "./ironclaw-adapter.ts";
import { nemoclawAdapter } from "./nemoclaw-adapter.ts";
import { hermesAdapter } from "./hermes-adapter.ts";
import { zeroclawAdapter } from "./zeroclaw-adapter.ts";
import { picoclawAdapter } from "./picoclaw-adapter.ts";

const ADAPTERS = new Map<RuntimeAdapterId, RuntimeAdapter>([
  [demoAdapter.id, demoAdapter],
  [openclawAdapter.id, openclawAdapter],
  [zeroclawAdapter.id, zeroclawAdapter],
  [picoclawAdapter.id, picoclawAdapter],
  [nanobotAdapter.id, nanobotAdapter],
  [nanoclawAdapter.id, nanoclawAdapter],
  [nullclawAdapter.id, nullclawAdapter],
  [ironclawAdapter.id, ironclawAdapter],
  [nemoclawAdapter.id, nemoclawAdapter],
  [hermesAdapter.id, hermesAdapter],
]);

export function listRuntimeAdapters(): RuntimeAdapter[] {
  return Array.from(ADAPTERS.values());
}

export function getRuntimeAdapter(adapterId: RuntimeAdapterId): RuntimeAdapter {
  const adapter = ADAPTERS.get(adapterId);
  if (!adapter) {
    throw new Error(`Unsupported runtime adapter: ${adapterId}`);
  }
  return adapter;
}
