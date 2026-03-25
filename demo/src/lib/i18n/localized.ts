import { defaultLocale, resolveLocale, type Locale } from "./messages.ts";

export type LocalizedValue<T> = Record<Locale, T>;

export function localized<T>(locale: string, values: LocalizedValue<T>): T {
  const resolved = resolveLocale(locale);
  return values[resolved] ?? values[defaultLocale];
}
