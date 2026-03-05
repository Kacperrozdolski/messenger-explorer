import { useTranslation } from "react-i18next";
import { Globe } from "lucide-react";
import { LANGUAGES } from "@/i18n";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const FLAG_EMOJI: Record<string, string> = {
  GB: "\u{1F1EC}\u{1F1E7}",
  PL: "\u{1F1F5}\u{1F1F1}",
  ES: "\u{1F1EA}\u{1F1F8}",
  DE: "\u{1F1E9}\u{1F1EA}",
  IT: "\u{1F1EE}\u{1F1F9}",
  CN: "\u{1F1E8}\u{1F1F3}",
  JP: "\u{1F1EF}\u{1F1F5}",
  BR: "\u{1F1E7}\u{1F1F7}",
};

const LanguageSelector = () => {
  const { i18n } = useTranslation();

  const handleChange = (lang: string) => {
    i18n.changeLanguage(lang);
    localStorage.setItem("app-language", lang);
  };

  return (
    <div className="flex items-center gap-2">
      <Globe className="h-4 w-4 text-muted-foreground shrink-0" />
      <Select value={i18n.language} onValueChange={handleChange}>
        <SelectTrigger className="h-8 w-auto gap-1.5 border-none bg-secondary text-[13px] focus:ring-1 focus:ring-ring px-2.5">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {LANGUAGES.map((lang) => (
            <SelectItem key={lang.code} value={lang.code}>
              {FLAG_EMOJI[lang.flag]} {lang.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
};

export default LanguageSelector;
