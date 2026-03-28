import assert from "node:assert/strict";
import test from "node:test";

import { locales, messagesByLocale } from "./i18n/messages.ts";
import { listRuntimeAdapters } from "@clawjs/claw";

/**
 * All providers supported by the SDK (from FLAGSHIP_MODELS in openclaw-models.ts).
 * OAuth providers use subscription-based login; API key providers use manual API keys.
 */
const OAUTH_PROVIDERS = ["openai-codex", "google-gemini-cli", "kimi-coding", "qwen"] as const;
const API_KEY_PROVIDERS = ["anthropic", "openai", "google", "deepseek", "mistral", "xai", "groq", "openrouter"] as const;
const ALL_SDK_PROVIDERS = [...OAUTH_PROVIDERS, ...API_KEY_PROVIDERS] as const;

/** i18n key mapping — each OAuth provider needs a *Sub and *SubHint key */
const OAUTH_I18N_KEYS: Record<string, { label: string; hint: string }> = {
  "openai-codex": { label: "chatgptSub", hint: "chatgptSubHint" },
  "google-gemini-cli": { label: "geminiSub", hint: "geminiSubHint" },
  "kimi-coding": { label: "kimiSub", hint: "kimiSubHint" },
  qwen: { label: "qwenSub", hint: "qwenSubHint" },
};

/** i18n key mapping — each API key provider needs a *Key key */
const API_KEY_I18N_KEYS: Record<string, string> = {
  anthropic: "anthropicKey",
  openai: "openaiKey",
  google: "googleKey",
  deepseek: "deepseekKey",
  mistral: "mistralKey",
  xai: "xaiKey",
  groq: "groqKey",
  openrouter: "openrouterKey",
};

/** Provider alias mapping for OAuth disconnect (matches the .replace() chain in settings) */
const OAUTH_ALIAS_MAP: Record<string, string> = {
  "openai-codex": "openai",
  "google-gemini-cli": "google",
  "kimi-coding": "kimi",
  qwen: "qwen",
};

test("all SDK providers have i18n labels in every locale", () => {
  for (const locale of locales) {
    const m = messagesByLocale[locale].onboarding.aiProvider;

    for (const provider of OAUTH_PROVIDERS) {
      const keys = OAUTH_I18N_KEYS[provider];
      assert.ok(keys, `Missing i18n key mapping for OAuth provider: ${provider}`);
      assert.ok(
        (m as Record<string, unknown>)[keys.label],
        `Missing ${keys.label} for locale ${locale}`
      );
      assert.ok(
        (m as Record<string, unknown>)[keys.hint],
        `Missing ${keys.hint} for locale ${locale}`
      );
    }

    for (const provider of API_KEY_PROVIDERS) {
      const key = API_KEY_I18N_KEYS[provider];
      assert.ok(key, `Missing i18n key mapping for API key provider: ${provider}`);
      assert.ok(
        (m as Record<string, unknown>)[key],
        `Missing ${key} for locale ${locale}`
      );
    }
  }
});

test("all 12 SDK providers are accounted for", () => {
  assert.equal(ALL_SDK_PROVIDERS.length, 12, "Expected 12 total providers");
  assert.equal(OAUTH_PROVIDERS.length, 4, "Expected 4 OAuth providers");
  assert.equal(API_KEY_PROVIDERS.length, 8, "Expected 8 API key providers");
});

test("OAuth alias map covers all OAuth providers", () => {
  for (const provider of OAUTH_PROVIDERS) {
    assert.ok(
      provider in OAUTH_ALIAS_MAP,
      `OAuth provider ${provider} missing from alias map`
    );
  }
});

test("no provider appears in both OAuth and API key lists", () => {
  const oauthSet = new Set<string>(OAUTH_PROVIDERS);
  for (const provider of API_KEY_PROVIDERS) {
    assert.ok(
      !oauthSet.has(provider),
      `Provider ${provider} appears in both OAuth and API key lists`
    );
  }
});

test("i18n label values are non-empty strings for all providers", () => {
  const m = messagesByLocale.en.onboarding.aiProvider;

  for (const provider of OAUTH_PROVIDERS) {
    const keys = OAUTH_I18N_KEYS[provider]!;
    const label = (m as Record<string, unknown>)[keys.label];
    const hint = (m as Record<string, unknown>)[keys.hint];
    assert.equal(typeof label, "string", `${keys.label} should be a string`);
    assert.equal(typeof hint, "string", `${keys.hint} should be a string`);
    assert.ok((label as string).length > 0, `${keys.label} should not be empty`);
    assert.ok((hint as string).length > 0, `${keys.hint} should not be empty`);
  }

  for (const provider of API_KEY_PROVIDERS) {
    const key = API_KEY_I18N_KEYS[provider]!;
    const label = (m as Record<string, unknown>)[key];
    assert.equal(typeof label, "string", `${key} should be a string`);
    assert.ok((label as string).length > 0, `${key} should not be empty`);
  }
});

/* ── Runtime adapter tests ── */

const VISIBLE_ADAPTERS = listRuntimeAdapters().filter((a) => a.supportLevel !== "demo");
const EXPECTED_ADAPTER_IDS = ["openclaw", "zeroclaw", "picoclaw", "nanobot", "nanoclaw", "nullclaw", "ironclaw", "nemoclaw", "hermes"];

test("SDK exposes 9 visible runtime adapters (excluding demo)", () => {
  assert.equal(VISIBLE_ADAPTERS.length, 9, `Expected 9 visible adapters, got ${VISIBLE_ADAPTERS.length}`);
  const ids = VISIBLE_ADAPTERS.map((a) => a.id).sort();
  const expected = [...EXPECTED_ADAPTER_IDS].sort();
  assert.deepEqual(ids, expected);
});

test("all visible adapters have i18n keys in every locale", () => {
  for (const locale of locales) {
    const adapters = messagesByLocale[locale].settings.adapters;
    for (const adapterId of EXPECTED_ADAPTER_IDS) {
      const entry = (adapters as Record<string, unknown>)[adapterId];
      assert.ok(entry, `Missing i18n entry for adapter ${adapterId} in locale ${locale}`);
      assert.ok(
        typeof (entry as { name: string }).name === "string" && (entry as { name: string }).name.length > 0,
        `Adapter ${adapterId} missing name in locale ${locale}`
      );
      assert.ok(
        typeof (entry as { hint: string }).hint === "string" && (entry as { hint: string }).hint.length > 0,
        `Adapter ${adapterId} missing hint in locale ${locale}`
      );
    }
  }
});

test("each adapter has required runtime metadata", () => {
  for (const adapter of VISIBLE_ADAPTERS) {
    assert.ok(adapter.id, `Adapter missing id`);
    assert.ok(adapter.runtimeName, `Adapter ${adapter.id} missing runtimeName`);
    assert.ok(adapter.stability, `Adapter ${adapter.id} missing stability`);
    assert.ok(adapter.supportLevel, `Adapter ${adapter.id} missing supportLevel`);
    assert.ok(
      ["stable", "experimental"].includes(adapter.stability),
      `Adapter ${adapter.id} has unexpected stability: ${adapter.stability}`
    );
  }
});

test("only openclaw is marked as recommended", () => {
  const recommended = VISIBLE_ADAPTERS.filter((a) => a.recommended);
  assert.equal(recommended.length, 1, "Expected exactly 1 recommended adapter");
  assert.equal(recommended[0]!.id, "openclaw");
});
