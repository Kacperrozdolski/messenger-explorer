import { useState, useRef, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Search, Grid3X3, List, ArrowUpDown, Settings, Users, User, MessageSquare, Brain, X, Image, Video, Sparkles, Calendar } from "lucide-react";
import type { SortOption, ViewMode, ChatSource, SenderInfo, FileTypeFilter } from "@/data/types";
import type { TimelineEntry } from "@/lib/api";
import { cn } from "@/lib/utils";
import { formatMonthKeyFull, getLocale } from "@/lib/locale";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface TopBarProps {
  search: string;
  onSearchChange: (v: string) => void;
  onSearchCommit: (query: string) => void;
  onAiSearch?: (query: string) => void;
  onClearAiSearch?: () => void;
  aiSearchAvailable?: boolean;
  aiSearchQuery?: string | null;
  sort: SortOption;
  onSortChange: (v: SortOption) => void;
  view: ViewMode;
  onViewChange: (v: ViewMode) => void;
  resultCount: number;
  conversations: ChatSource[];
  senders: SenderInfo[];
  onSelectChat: (id: number | null) => void;
  onSelectSender: (id: number | null) => void;
  onFileTypeChange: (ft: FileTypeFilter) => void;
  onSelectMonth: (month: string | null) => void;
  timelineData: TimelineEntry[];
  onOpenIndexing?: () => void;
}

interface Suggestion {
  type: "search" | "group" | "sender" | "ai-search" | "media-type" | "date";
  label: string;
  id?: number;
  value?: string; // for media-type (file type value) or date (month_key/year)
}

const MAX_SUGGESTIONS = 5;

const TopBar = ({
  search,
  onSearchChange,
  onSearchCommit,
  onAiSearch,
  onClearAiSearch,
  aiSearchAvailable,
  aiSearchQuery,
  sort,
  onSortChange,
  view,
  onViewChange,
  resultCount,
  conversations,
  senders,
  onSelectChat,
  onSelectSender,
  onFileTypeChange,
  onSelectMonth,
  timelineData,
  onOpenIndexing,
}: TopBarProps) => {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [highlightIndex, setHighlightIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const query = search.trim().toLowerCase();

  // Build available years from timeline data
  const availableYears = useMemo(() => {
    const yearMap = new Map<string, number>();
    for (const entry of timelineData) {
      const year = entry.month_key.split("-")[0];
      yearMap.set(year, (yearMap.get(year) ?? 0) + entry.count);
    }
    return Array.from(yearMap.entries()).map(([year, count]) => ({ year, count }));
  }, [timelineData]);

  // Build media type aliases including translated labels
  const mediaTypeAliases = useMemo(() => {
    const base: { value: FileTypeFilter; labels: string[] }[] = [
      { value: "image", labels: ["image", "images", "photo", "photos", "picture", "pictures", "img"] },
      { value: "video", labels: ["video", "videos", "vid", "vids", "movie", "movies", "clip", "clips"] },
      { value: "gif", labels: ["gif", "gifs", "animated"] },
    ];
    // Add translated labels from i18n
    for (const mt of base) {
      const translated = mt.value === "image" ? t("sidebar.images") : mt.value === "video" ? t("sidebar.videos") : t("sidebar.gifs");
      const translatedType = t(`sidebar.${mt.value === "gif" ? "gifs" : mt.value === "image" ? "images" : "videos"}`);
      for (const s of [translated, translatedType]) {
        const lower = s.toLowerCase();
        if (!mt.labels.includes(lower)) mt.labels.push(lower);
      }
      // Also add the sidebar.mediaType section label values (singular forms)
      const singular = translated.replace(/s$/i, "").toLowerCase();
      if (singular && !mt.labels.includes(singular)) mt.labels.push(singular);
    }
    return base;
  }, [t]);

  // Build month names including localized forms
  const monthNames = useMemo(() => {
    const locale = getLocale();
    return Array.from({ length: 12 }, (_, i) => {
      const monthNum = String(i + 1).padStart(2, "0");
      const date = new Date(2000, i);
      const long = date.toLocaleString(locale, { month: "long" }).toLowerCase();
      const short = date.toLocaleString(locale, { month: "short" }).toLowerCase().replace(".", "");
      // English fallback names
      const enDate = new Date(2000, i);
      const enLong = enDate.toLocaleString("en-US", { month: "long" }).toLowerCase();
      const enShort = enDate.toLocaleString("en-US", { month: "short" }).toLowerCase();
      const names = new Set([long, short, enLong, enShort]);
      return { month: monthNum, names: Array.from(names) };
    });
  }, []);

  const suggestions = useMemo<Suggestion[]>(() => {
    if (!query) return [];
    const results: Suggestion[] = [];

    // Matching groups
    const matchingGroups = conversations
      .filter((c) => c.name.toLowerCase().includes(query))
      .slice(0, MAX_SUGGESTIONS);
    for (const g of matchingGroups) {
      results.push({ type: "group", label: g.name, id: g.id });
    }

    // Matching senders
    const matchingSenders = senders
      .filter((s) => s.name.toLowerCase().includes(query))
      .slice(0, MAX_SUGGESTIONS);
    for (const s of matchingSenders) {
      results.push({ type: "sender", label: s.name, id: s.id });
    }

    // Matching media types
    for (const mt of mediaTypeAliases) {
      if (mt.labels.some((l) => l.startsWith(query) || query.startsWith(l))) {
        const label = mt.value === "image" ? t("sidebar.images") : mt.value === "video" ? t("sidebar.videos") : t("sidebar.gifs");
        results.push({ type: "media-type", label, value: mt.value });
      }
    }

    // Matching years
    for (const { year } of availableYears) {
      if (year.includes(query)) {
        results.push({ type: "date", label: year, value: year });
      }
    }

    // Matching months (e.g. "january", "jan 2024", "grudzień")
    const addedMonthKeys = new Set<string>();
    for (const mn of monthNames) {
      if (mn.names.some((n) => n.startsWith(query) || query.startsWith(n))) {
        const matchingEntries = timelineData.filter((e) => e.month_key.endsWith(`-${mn.month}`));
        for (const entry of matchingEntries.slice(0, 3)) {
          if (!addedMonthKeys.has(entry.month_key)) {
            addedMonthKeys.add(entry.month_key);
            results.push({ type: "date", label: formatMonthKeyFull(entry.month_key), value: entry.month_key });
          }
        }
      }
    }

    // Always add "search in messages" option
    results.push({ type: "search", label: search.trim() });

    // Add AI search option
    if (aiSearchAvailable) {
      results.push({ type: "ai-search", label: search.trim() });
    }

    return results;
  }, [query, conversations, senders, search, aiSearchAvailable, availableYears, timelineData, t, mediaTypeAliases, monthNames]);

  // Reset highlight when suggestions change
  useEffect(() => {
    setHighlightIndex(suggestions.length > 0 ? suggestions.length - 1 : 0);
  }, [suggestions.length]);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node) &&
        inputRef.current &&
        !inputRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const applySuggestion = (suggestion: Suggestion) => {
    if (suggestion.type === "group") {
      onSelectChat(suggestion.id!);
      onSearchChange("");
    } else if (suggestion.type === "sender") {
      onSelectSender(suggestion.id!);
      onSearchChange("");
    } else if (suggestion.type === "media-type") {
      onFileTypeChange(suggestion.value as FileTypeFilter);
      onSearchChange("");
    } else if (suggestion.type === "date") {
      onSelectMonth(suggestion.value!);
      onSearchChange("");
    } else if (suggestion.type === "ai-search") {
      onAiSearch?.(suggestion.label);
    } else if (suggestion.type === "search") {
      onSearchCommit(suggestion.label);
    }
    setOpen(false);
    inputRef.current?.blur();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!open || suggestions.length === 0) {
      if (e.key === "ArrowDown" && query) {
        setOpen(true);
        e.preventDefault();
      } else if (e.key === "Enter" && query) {
        e.preventDefault();
        onSearchCommit(search.trim());
        setOpen(false);
        inputRef.current?.blur();
      }
      return;
    }

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightIndex((i) => (i + 1) % suggestions.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightIndex((i) => (i - 1 + suggestions.length) % suggestions.length);
    } else if (e.key === "Enter") {
      e.preventDefault();
      applySuggestion(suggestions[highlightIndex]);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  };

  return (
    <div className="h-14 border-b border-border flex items-center gap-3 px-5 bg-card/50 shrink-0">
      {/* Search */}
      <div className="relative flex-1 max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
        <input
          ref={inputRef}
          type="text"
          placeholder={t("topbar.search")}
          value={search}
          onChange={(e) => {
            onSearchChange(e.target.value);
            if (e.target.value.trim()) {
              setOpen(true);
            } else {
              setOpen(false);
            }
          }}
          onFocus={() => {
            if (query) setOpen(true);
          }}
          onKeyDown={handleKeyDown}
          className="w-full pl-9 pr-3 py-2 text-[13px] rounded-md bg-secondary border-none text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring transition-all"
        />

        {/* Suggestions dropdown */}
        {open && suggestions.length > 0 && (
          <div
            ref={dropdownRef}
            className="absolute top-full left-0 right-0 mt-1 bg-popover border border-border rounded-md shadow-md z-50 overflow-hidden"
          >
            {suggestions.map((s, i) => (
              <button
                key={`${s.type}-${s.id ?? "search"}`}
                onMouseDown={(e) => {
                  e.preventDefault();
                  applySuggestion(s);
                }}
                onMouseEnter={() => setHighlightIndex(i)}
                className={cn(
                  "flex items-center gap-2.5 w-full px-3 py-2 text-[13px] text-left transition-colors",
                  i === highlightIndex
                    ? "bg-accent text-accent-foreground"
                    : "text-popover-foreground hover:bg-accent/50",
                )}
              >
                {s.type === "group" && <Users className="h-3.5 w-3.5 text-muted-foreground shrink-0" />}
                {s.type === "sender" && <User className="h-3.5 w-3.5 text-muted-foreground shrink-0" />}
                {s.type === "search" && <MessageSquare className="h-3.5 w-3.5 text-muted-foreground shrink-0" />}
                {s.type === "ai-search" && <Brain className="h-3.5 w-3.5 text-primary shrink-0" />}
                {s.type === "media-type" && (
                  s.value === "image" ? <Image className="h-3.5 w-3.5 text-muted-foreground shrink-0" /> :
                  s.value === "video" ? <Video className="h-3.5 w-3.5 text-muted-foreground shrink-0" /> :
                  <Sparkles className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                )}
                {s.type === "date" && <Calendar className="h-3.5 w-3.5 text-muted-foreground shrink-0" />}
                <span className="truncate flex-1">
                  {s.type === "search"
                    ? t("topbar.searchInMessages", { query: s.label })
                    : s.type === "ai-search"
                    ? t("topbar.aiSearch", { query: s.label, defaultValue: "AI Search \"{{query}}\"" })
                    : s.label}
                </span>
                <span className="text-[11px] text-muted-foreground shrink-0">
                  {s.type === "group" && t("topbar.filterByGroup")}
                  {s.type === "sender" && t("topbar.filterBySender")}
                  {s.type === "media-type" && t("topbar.filterByMediaType")}
                  {s.type === "date" && t("topbar.filterByDate")}
                  {s.type === "ai-search" && t("topbar.aiSearchHint", "Visual content")}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Result count */}
      <span className="text-[12px] text-muted-foreground whitespace-nowrap">
        {t("topbar.items", { count: resultCount })}
      </span>

      {/* Sort */}
      <div className="flex items-center gap-1.5">
        <ArrowUpDown className="h-3.5 w-3.5 text-muted-foreground" />
        <Select value={sort} onValueChange={(v) => onSortChange(v as SortOption)}>
          <SelectTrigger className="h-8 w-auto gap-1.5 border-none bg-secondary text-[13px] focus:ring-1 focus:ring-ring px-2.5">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="date-desc">{t("topbar.newestFirst")}</SelectItem>
            <SelectItem value="date-asc">{t("topbar.oldestFirst")}</SelectItem>
            <SelectItem value="sender">{t("topbar.bySender")}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* View toggle */}
      <div className="flex items-center bg-secondary rounded-md p-0.5">
        <button
          onClick={() => onViewChange("grid")}
          className={cn(
            "p-1.5 rounded transition-colors",
            view === "grid" ? "bg-accent text-foreground" : "text-muted-foreground hover:text-foreground"
          )}
        >
          <Grid3X3 className="h-3.5 w-3.5" />
        </button>
        <button
          onClick={() => onViewChange("list")}
          className={cn(
            "p-1.5 rounded transition-colors",
            view === "list" ? "bg-accent text-foreground" : "text-muted-foreground hover:text-foreground"
          )}
        >
          <List className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* AI Indexing */}
      {onOpenIndexing && (
        <button
          onClick={onOpenIndexing}
          className="p-1.5 rounded transition-colors text-muted-foreground hover:text-foreground hover:bg-accent"
          title={t("indexing.title", "Selective AI Indexing")}
        >
          <Brain className="h-3.5 w-3.5" />
        </button>
      )}

      {/* Settings */}
      <button
        onClick={() => navigate("/settings")}
        className="p-1.5 rounded transition-colors text-muted-foreground hover:text-foreground hover:bg-accent"
      >
        <Settings className="h-3.5 w-3.5" />
      </button>
    </div>
  );
};

export default TopBar;
