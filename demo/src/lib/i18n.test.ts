import assert from "node:assert/strict";
import test from "node:test";

import { getMessages, locales, messagesByLocale, resolveLocale } from "./i18n/messages.ts";

function shapeOf(value: unknown): unknown {
  if (Array.isArray(value)) {
    return ["array", value.length > 0 ? shapeOf(value[0]) : "empty"];
  }
  if (typeof value === "function") {
    return "function";
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, nested]) => [key, shapeOf(nested)])
    );
  }
  return typeof value;
}

function collectStrings(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap((item) => collectStrings(item));
  if (value && typeof value === "object") return Object.values(value).flatMap((item) => collectStrings(item));
  return [];
}

test("all locales implement the same translation shape as english", () => {
  const englishShape = shapeOf(messagesByLocale.en);
  for (const locale of locales) {
    assert.deepEqual(shapeOf(messagesByLocale[locale]), englishShape);
  }
});

test("resolveLocale falls back to english for unsupported values", () => {
  assert.equal(resolveLocale("es"), "es");
  assert.equal(resolveLocale("unsupported"), "en");
  assert.equal(resolveLocale(undefined), "en");
});

test("getMessages returns the requested locale dictionary", () => {
  assert.equal(getMessages("fr").nav.settings, "Réglages");
  assert.equal(getMessages("de").chat.newSession, "Chat");
});

test("corrected localized copy keeps diacritics in key spanish and portuguese flows", () => {
  const spanish = getMessages("es");
  const portuguese = getMessages("pt");

  assert.equal(spanish.onboarding.disclaimer.openSourceTitle, "Código abierto, sin garantía");
  assert.equal(portuguese.onboarding.disclaimer.title, "Antes de continuar");
});

test("selected non-english locales keep translated labels instead of english fallbacks", () => {
  assert.equal(getMessages("fr").settings.tabs.ai, "Modèles");
  assert.equal(getMessages("it").settings.tabs.ai, "Modelli");
  assert.equal(getMessages("de").settings.tabs.ai, "Modelle");
  assert.equal(getMessages("es").settings.tabs.ai, "Modelos");
  assert.equal(getMessages("pt").settings.tabs.ai, "Modelos");
});

test("openclaw onboarding hint stays generic across all supported locales", () => {
  const expectedHints = {
    en: "Core engine that manages contacts, integrations, and automated actions.",
    es: "Motor principal que gestiona contactos, integraciones y acciones automáticas.",
    fr: "Moteur principal qui gère les contacts, les intégrations et les actions automatisées.",
    it: "Motore principale che gestisce contatti, integrazioni e azioni automatiche.",
    de: "Kernmodul, das Kontakte, Integrationen und automatische Aktionen verwaltet.",
    pt: "Motor principal que gere contactos, integrações e ações automáticas.",
  } as const;

  for (const [locale, expectedHint] of Object.entries(expectedHints)) {
    const hint = getMessages(locale as keyof typeof expectedHints).onboarding.engine.openClawHint;
    assert.equal(hint, expectedHint);
    assert.equal(hint.toLowerCase().includes("whatsapp"), false, `Locale ${locale} should not mention WhatsApp in onboarding hint`);
  }
});

test("common broken orthography fragments are not present in reviewed locales", () => {
  const reviewedLocales = {
    es: [
      "autorreflexion",
      "atencion profesional",
      "Codigo abierto",
      "Respiracion cuadrada",
      "Lectura automatica",
      "Eliminala",
    ],
    pt: [
      "Antes de comecar",
      "Nao e um terapeuta real",
      "Respiracao quadrada",
      "variavel de ambiente",
      "Leitura automatica",
      "audio que o ClawJS usa para entrada e saida",
    ],
  } as const;

  for (const [locale, forbiddenFragments] of Object.entries(reviewedLocales)) {
    const joined = collectStrings(getMessages(locale as keyof typeof reviewedLocales)).join("\n");
    for (const fragment of forbiddenFragments) {
      assert.equal(
        joined.includes(fragment),
        false,
        `Locale ${locale} still contains forbidden fragment: ${fragment}`
      );
    }
  }
});
