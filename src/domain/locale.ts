/** Interface languages. Simulation texts, UI messages and docs are written in both. */
export const LOCALES = ['pt-BR', 'en'] as const
export type Locale = (typeof LOCALES)[number]
export type Localized = Record<Locale, string>
export const LOCALE_LABELS: Record<Locale, string> = { 'pt-BR': 'Português', en: 'English' }

/** Stored choice first, then the browser language: any Portuguese variant maps to pt-BR, everything else to English. */
export function detectLocale(stored: string | null | undefined, browser: string | null | undefined): Locale {
  if (stored && (LOCALES as readonly string[]).includes(stored)) return stored as Locale
  return browser?.toLowerCase().startsWith('pt') ? 'pt-BR' : 'en'
}
