import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Search, Grid3X3, List, ArrowUpDown, Settings } from "lucide-react";
import type { SortOption, ViewMode } from "@/data/types";
import { cn } from "@/lib/utils";

interface TopBarProps {
  search: string;
  onSearchChange: (v: string) => void;
  sort: SortOption;
  onSortChange: (v: SortOption) => void;
  view: ViewMode;
  onViewChange: (v: ViewMode) => void;
  resultCount: number;
}

const TopBar = ({ search, onSearchChange, sort, onSortChange, view, onViewChange, resultCount }: TopBarProps) => {
  const navigate = useNavigate();
  const { t } = useTranslation();

  return (
    <div className="h-14 border-b border-border flex items-center gap-3 px-5 bg-card/50 shrink-0">
      {/* Search */}
      <div className="relative flex-1 max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
        <input
          type="text"
          placeholder={t("topbar.search")}
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          className="w-full pl-9 pr-3 py-2 text-[13px] rounded-md bg-secondary border-none text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring transition-all"
        />
      </div>

      {/* Result count */}
      <span className="text-[12px] text-muted-foreground whitespace-nowrap">
        {t("topbar.items", { count: resultCount })}
      </span>

      {/* Sort */}
      <div className="flex items-center gap-1.5">
        <ArrowUpDown className="h-3.5 w-3.5 text-muted-foreground" />
        <select
          value={sort}
          onChange={(e) => onSortChange(e.target.value as SortOption)}
          className="text-[13px] bg-secondary text-foreground rounded-md px-2 py-1.5 border-none focus:outline-none focus:ring-1 focus:ring-ring cursor-pointer"
        >
          <option value="date-desc">{t("topbar.newestFirst")}</option>
          <option value="date-asc">{t("topbar.oldestFirst")}</option>
          <option value="sender">{t("topbar.bySender")}</option>
        </select>
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
