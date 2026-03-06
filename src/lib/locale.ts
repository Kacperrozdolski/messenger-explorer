import i18n from "@/i18n";

const LOCALE_MAP: Record<string, string> = {
  pl: "pl-PL",
  en: "en-US",
  es: "es-ES",
  de: "de-DE",
  it: "it-IT",
  zh: "zh-CN",
  ja: "ja-JP",
  pt: "pt-BR",
};

export function getLocale(): string {
  return LOCALE_MAP[i18n.language] ?? "en-US";
}

export function formatMonthKeyLabel(monthKey: string): string {
  const [year, month] = monthKey.split("-");
  if (!year || !month) return monthKey;
  const date = new Date(Number(year), Number(month) - 1);
  return date.toLocaleString(getLocale(), { month: "short" });
}

export function formatMonthKeyFull(monthKey: string): string {
  const [year, month] = monthKey.split("-");
  if (!year || !month) return monthKey;
  const date = new Date(Number(year), Number(month) - 1);
  return date.toLocaleString(getLocale(), { month: "long", year: "numeric" });
}
