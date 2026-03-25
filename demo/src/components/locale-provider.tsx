"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { defaultLocale, getMessages, localeMetadata, locales, resolveLocale, type Locale, type Messages } from "@/lib/i18n/messages";

interface LocaleContextValue {
  locale: Locale;
  messages: Messages;
  languageOptions: Array<{ code: Locale; label: string }>;
  intlLocale: string;
  speechLocale: string;
  setLocale: (locale: Locale) => void;
  formatDate: (value: Date, options?: Intl.DateTimeFormatOptions) => string;
}

const LocaleContext = createContext<LocaleContextValue | null>(null);

export function LocaleProvider({
  initialLocale = defaultLocale,
  children,
}: Readonly<{
  initialLocale?: Locale;
  children: React.ReactNode;
}>) {
  const [locale, setLocaleState] = useState<Locale>(resolveLocale(initialLocale));

  useEffect(() => {
    document.documentElement.lang = localeMetadata[locale].intl;
  }, [locale]);

  const value = useMemo<LocaleContextValue>(() => {
    const intlLocale = localeMetadata[locale].intl;
    return {
      locale,
      messages: getMessages(locale),
      languageOptions: locales.map((code) => ({
        code,
        label: localeMetadata[code].nativeLabel,
      })),
      intlLocale,
      speechLocale: localeMetadata[locale].speech,
      setLocale: setLocaleState,
      formatDate: (value, options) => new Intl.DateTimeFormat(intlLocale, options).format(value),
    };
  }, [locale]);

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useLocale() {
  const context = useContext(LocaleContext);
  if (!context) {
    throw new Error("useLocale must be used within LocaleProvider");
  }
  return context;
}
