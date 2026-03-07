import { useState, useRef, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Search, Grid3X3, List, ArrowUpDown, Settings, Users, User, MessageSquare, Brain, X } from "lucide-react";
import type { SortOption, ViewMode, ChatSource, SenderInfo } from "@/data/types";
import { cn } from "@/lib/utils";
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
}

interface Suggestion {
  type: "search" | "group" | "sender" | "ai-search";
  label: string;
  id?: number;
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
}: TopBarProps) => {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [highlightIndex, setHighlightIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const query = search.trim().toLowerCase();

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

    // Always add "search in messages" option
    results.push({ type: "search", label: search.trim() });

    // Add AI search option
    if (aiSearchAvailable) {
      results.push({ type: "ai-search", label: search.trim() });
    }

    return results;
  }, [query, conversations, senders, search, aiSearchAvailable]);

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
