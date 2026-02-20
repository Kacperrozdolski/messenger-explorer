import { useState, useMemo } from "react";
import { useTranslation } from "react-i18next";
import {
  ChevronDown,
  ChevronRight,
  Users,
  User,
  Image,
  Video,
  Sparkles,
  Calendar,
  X,
  Search,
} from "lucide-react";
import type { ChatSource, SenderInfo, FileTypeFilter } from "@/data/types";
import type { TimelineEntry } from "@/lib/api";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from "@/components/ui/popover";
import {
  Command,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
} from "@/components/ui/command";
import {
  Collapsible,
  CollapsibleTrigger,
  CollapsibleContent,
} from "@/components/ui/collapsible";

interface ArchiveSidebarProps {
  conversations: ChatSource[];
  senders: SenderInfo[];
  selectedChat: number | null;
  onSelectChat: (id: number | null) => void;
  selectedSender: number | null;
  onSelectSender: (id: number | null) => void;
  fileType: FileTypeFilter;
  onFileTypeChange: (ft: FileTypeFilter) => void;
  selectedMonth: string | null;
  onSelectMonth: (month: string | null) => void;
  timelineData: TimelineEntry[];
}

const TOP_N = 5;

const Section = ({
  title,
  icon: Icon,
  children,
  defaultOpen = true,
}: {
  title: string;
  icon: React.ElementType;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) => {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="mb-1">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 w-full px-3 py-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors"
      >
        {open ? (
          <ChevronDown className="h-3 w-3" />
        ) : (
          <ChevronRight className="h-3 w-3" />
        )}
        <Icon className="h-3.5 w-3.5" />
        {title}
      </button>
      {open && <div className="px-1 pb-2">{children}</div>}
    </div>
  );
};

function BrowseAllCombobox<
  T extends { id: number; name: string; mediaCount: number },
>({
  items,
  selectedId,
  onSelect,
  placeholder,
  browseLabel,
  noResultsLabel,
}: {
  items: T[];
  selectedId: number | null;
  onSelect: (id: number | null) => void;
  placeholder: string;
  browseLabel: string;
  noResultsLabel: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button className="flex items-center gap-1.5 w-full px-3 py-1.5 text-[12px] text-muted-foreground hover:text-foreground transition-colors rounded-md hover:bg-sidebar-accent/50">
          <Search className="h-3 w-3" />
          {browseLabel}
        </button>
      </PopoverTrigger>
      <PopoverContent className="p-0 w-56" align="start">
        <Command>
          <CommandInput placeholder={placeholder} className="h-9" />
          <CommandList>
            <CommandEmpty>{noResultsLabel}</CommandEmpty>
            <CommandGroup>
              {items.map((item) => (
                <CommandItem
                  key={item.id}
                  value={item.name}
                  onSelect={() => {
                    onSelect(selectedId === item.id ? null : item.id);
                    setOpen(false);
                  }}
                  className={cn(
                    "flex items-center justify-between",
                    selectedId === item.id && "bg-accent",
                  )}
                >
                  <span className="truncate">{item.name}</span>
                  <span className="text-[11px] text-muted-foreground ml-2">
                    {item.mediaCount}
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

function SourceButton({
  item,
  isSelected,
  onSelect,
}: {
  item: ChatSource;
  isSelected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      onClick={onSelect}
      className={cn(
        "flex items-center justify-between w-full px-3 py-1.5 text-[13px] rounded-md transition-colors",
        isSelected
          ? "bg-sidebar-accent text-sidebar-accent-foreground"
          : "text-sidebar-foreground hover:bg-sidebar-accent/50",
      )}
    >
      <span
        className={cn(
          "truncate",
          item.type === "dm" && "flex items-center gap-1.5",
        )}
      >
        {item.type === "dm" && <User className="h-3 w-3 shrink-0" />}
        {item.name}
      </span>
      <span className="text-[11px] bg-secondary px-1.5 py-0.5 rounded-full text-secondary-foreground">
        {item.mediaCount}
      </span>
    </button>
  );
}

function SenderButton({
  sender,
  isSelected,
  onSelect,
}: {
  sender: SenderInfo;
  isSelected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      onClick={onSelect}
      className={cn(
        "flex items-center justify-between w-full px-3 py-1.5 text-[13px] rounded-md transition-colors",
        isSelected
          ? "bg-sidebar-accent text-sidebar-accent-foreground"
          : "text-sidebar-foreground hover:bg-sidebar-accent/50",
      )}
    >
      <span className="flex items-center gap-1.5 truncate">
        <User className="h-3 w-3 shrink-0" />
        {sender.name}
      </span>
      <span className="text-[11px] bg-secondary px-1.5 py-0.5 rounded-full text-secondary-foreground">
        {sender.mediaCount}
      </span>
    </button>
  );
}

interface YearGroup {
  year: string;
  months: TimelineEntry[];
  totalCount: number;
}

function YearRow({
  yearGroup,
  maxCount,
  maxYearCount,
  selectedMonth,
  onSelectMonth,
}: {
  yearGroup: YearGroup;
  maxCount: number;
  maxYearCount: number;
  selectedMonth: string | null;
  onSelectMonth: (month: string | null) => void;
}) {
  const hasSelectedMonth = yearGroup.months.some(
    (m) => m.month_key === selectedMonth,
  );
  const [open, setOpen] = useState(hasSelectedMonth);

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger asChild>
        <button
          className={cn(
            "flex items-center gap-2 w-full py-1 text-[12px] rounded transition-colors group",
            hasSelectedMonth
              ? "text-primary"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {open ? (
            <ChevronDown className="h-3 w-3 shrink-0" />
          ) : (
            <ChevronRight className="h-3 w-3 shrink-0" />
          )}
          <span className="w-10 text-left shrink-0 font-medium">
            {yearGroup.year}
          </span>
          <div className="flex-1 h-3 bg-secondary rounded-sm overflow-hidden">
            <div
              className={cn(
                "h-full rounded-sm transition-all",
                hasSelectedMonth
                  ? "bg-primary"
                  : "bg-muted-foreground/30 group-hover:bg-muted-foreground/50",
              )}
              style={{
                width: `${(yearGroup.totalCount / maxYearCount) * 100}%`,
              }}
            />
          </div>
          <span className="w-6 text-right text-[11px]">
            {yearGroup.totalCount}
          </span>
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="pl-5 space-y-0.5">
          {yearGroup.months.map((d) => (
            <button
              key={d.month_key}
              onClick={() =>
                onSelectMonth(
                  selectedMonth === d.month_key ? null : d.month_key,
                )
              }
              className={cn(
                "flex items-center gap-2 w-full py-1 text-[12px] rounded transition-colors group",
                selectedMonth === d.month_key
                  ? "text-primary"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <span className="w-10 text-left shrink-0">
                {d.label.replace(/\s*\d{4}$/, "")}
              </span>
              <div className="flex-1 h-3 bg-secondary rounded-sm overflow-hidden">
                <div
                  className={cn(
                    "h-full rounded-sm transition-all",
                    selectedMonth === d.month_key
                      ? "bg-primary"
                      : "bg-muted-foreground/30 group-hover:bg-muted-foreground/50",
                  )}
                  style={{ width: `${(d.count / maxCount) * 100}%` }}
                />
              </div>
              <span className="w-4 text-right">{d.count}</span>
            </button>
          ))}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

const FILE_TYPE_LABELS: Record<string, string> = {
  image: "images",
  video: "videos",
  gif: "gifs",
};

const ArchiveSidebar = ({
  conversations,
  senders,
  selectedChat,
  onSelectChat,
  selectedSender,
  onSelectSender,
  fileType,
  onFileTypeChange,
  selectedMonth,
  onSelectMonth,
  timelineData,
}: ArchiveSidebarProps) => {
  const { t } = useTranslation();

  // Sort all conversations by mediaCount descending
  const allSorted = useMemo(
    () => [...conversations].sort((a, b) => b.mediaCount - a.mediaCount),
    [conversations],
  );
  const topSources = allSorted.slice(0, TOP_N);

  // Check if selected source is in top 5
  const selectedSourceInTop =
    selectedChat !== null && topSources.some((s) => s.id === selectedChat);
  const selectedSource =
    selectedChat !== null
      ? conversations.find((c) => c.id === selectedChat) ?? null
      : null;

  // Sort senders by mediaCount descending
  const sortedSenders = useMemo(
    () => [...senders].sort((a, b) => b.mediaCount - a.mediaCount),
    [senders],
  );
  const topSenders = sortedSenders.slice(0, TOP_N);
  const selectedSenderInTop =
    selectedSender !== null && topSenders.some((s) => s.id === selectedSender);
  const selectedSenderObj =
    selectedSender !== null
      ? senders.find((s) => s.id === selectedSender) ?? null
      : null;

  // Group timeline by year
  const yearGroups = useMemo<YearGroup[]>(() => {
    const map = new Map<string, TimelineEntry[]>();
    for (const entry of timelineData) {
      const year = entry.month_key.split("-")[0];
      if (!map.has(year)) map.set(year, []);
      map.get(year)!.push(entry);
    }
    return Array.from(map.entries()).map(([year, months]) => ({
      year,
      months,
      totalCount: months.reduce((sum, m) => sum + m.count, 0),
    }));
  }, [timelineData]);

  const maxCount = Math.max(...timelineData.map((d) => d.count), 1);
  const maxYearCount = Math.max(...yearGroups.map((y) => y.totalCount), 1);

  // Active filters
  const hasActiveFilters =
    selectedChat !== null ||
    selectedSender !== null ||
    fileType !== "all" ||
    selectedMonth !== null;

  const selectedMonthLabel = selectedMonth
    ? (timelineData.find((t) => t.month_key === selectedMonth)?.label ??
      selectedMonth)
    : null;

  return (
    <aside className="w-60 min-w-[240px] h-screen bg-sidebar border-r border-sidebar-border flex flex-col overflow-hidden">
      {/* Brand */}
      <div className="px-4 py-4 border-b border-sidebar-border">
        <h1 className="text-sm font-bold text-foreground tracking-tight">
          {t("brand.title")}
        </h1>
        <p className="text-[11px] text-muted-foreground mt-0.5">
          {t("brand.subtitle")}
        </p>
      </div>

      {/* Active Filters - sticky */}
      {hasActiveFilters && (
        <div className="px-3 py-2 border-b border-sidebar-border bg-sidebar flex flex-wrap gap-1.5">
          {selectedSource && (
            <Badge
              variant="secondary"
              className="text-[11px] px-2 py-0.5 gap-1"
            >
              {selectedSource.name}
              <button
                onClick={() => onSelectChat(null)}
                className="ml-0.5 hover:text-destructive"
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          )}
          {selectedSenderObj && (
            <Badge
              variant="secondary"
              className="text-[11px] px-2 py-0.5 gap-1"
            >
              {selectedSenderObj.name}
              <button
                onClick={() => onSelectSender(null)}
                className="ml-0.5 hover:text-destructive"
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          )}
          {fileType !== "all" && (
            <Badge
              variant="secondary"
              className="text-[11px] px-2 py-0.5 gap-1 capitalize"
            >
              {fileType}s
              <button
                onClick={() => onFileTypeChange("all")}
                className="ml-0.5 hover:text-destructive"
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          )}
          {selectedMonthLabel && (
            <Badge
              variant="secondary"
              className="text-[11px] px-2 py-0.5 gap-1"
            >
              {selectedMonthLabel}
              <button
                onClick={() => onSelectMonth(null)}
                className="ml-0.5 hover:text-destructive"
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          )}
        </div>
      )}

      <div className="flex-1 overflow-y-auto py-2">
        {/* Sources - Top 5 by media count */}
        <Section title={t("sidebar.sources")} icon={Users}>
          {/* Show selected source above top 5 if it's outside the top 5 */}
          {selectedSource && !selectedSourceInTop && (
            <SourceButton
              item={selectedSource}
              isSelected={true}
              onSelect={() => onSelectChat(null)}
            />
          )}
          {topSources.map((item) => (
            <SourceButton
              key={item.id}
              item={item}
              isSelected={selectedChat === item.id}
              onSelect={() =>
                onSelectChat(selectedChat === item.id ? null : item.id)
              }
            />
          ))}
          {allSorted.length > TOP_N && (
            <BrowseAllCombobox
              items={allSorted}
              selectedId={selectedChat}
              onSelect={onSelectChat}
              placeholder={t("sidebar.searchSources")}
              browseLabel={t("sidebar.browseAll", { count: allSorted.length })}
              noResultsLabel={t("sidebar.noResults")}
            />
          )}
        </Section>

        {/* Smart Filters */}
        <Section title={t("sidebar.smartFilters")} icon={Sparkles}>
          <p className="px-3 py-1 text-[11px] text-muted-foreground font-medium">
            {t("sidebar.bySender")}
          </p>
          {/* Show selected sender above top 5 if it's outside the top 5 */}
          {selectedSenderObj && !selectedSenderInTop && (
            <SenderButton
              sender={selectedSenderObj}
              isSelected={true}
              onSelect={() => onSelectSender(null)}
            />
          )}
          {topSenders.map((s) => (
            <SenderButton
              key={s.id}
              sender={s}
              isSelected={selectedSender === s.id}
              onSelect={() =>
                onSelectSender(selectedSender === s.id ? null : s.id)
              }
            />
          ))}
          {sortedSenders.length > TOP_N && (
            <BrowseAllCombobox
              items={sortedSenders}
              selectedId={selectedSender}
              onSelect={onSelectSender}
              placeholder={t("sidebar.searchSenders")}
              browseLabel={t("sidebar.browseAll", { count: sortedSenders.length })}
              noResultsLabel={t("sidebar.noResults")}
            />
          )}

          <p className="px-3 py-1 mt-2 text-[11px] text-muted-foreground font-medium">
            {t("sidebar.byFileType")}
          </p>
          {(["all", "image", "video", "gif"] as FileTypeFilter[]).map((ft) => (
            <button
              key={ft}
              onClick={() => onFileTypeChange(ft)}
              className={cn(
                "flex items-center gap-2 w-full px-3 py-1.5 text-[13px] rounded-md transition-colors capitalize",
                fileType === ft
                  ? "bg-sidebar-accent text-sidebar-accent-foreground"
                  : "text-sidebar-foreground hover:bg-sidebar-accent/50",
              )}
            >
              {ft === "image" ? (
                <Image className="h-3 w-3" />
              ) : ft === "video" ? (
                <Video className="h-3 w-3" />
              ) : ft === "gif" ? (
                <Sparkles className="h-3 w-3" />
              ) : (
                <Image className="h-3 w-3" />
              )}
              {ft === "all" ? t("sidebar.allTypes") : t(`sidebar.${FILE_TYPE_LABELS[ft]}`)}
            </button>
          ))}
        </Section>

        {/* Timeline - Year > Month tree */}
        <Section title={t("sidebar.timeline")} icon={Calendar}>
          <div className="px-3 space-y-0.5">
            {yearGroups.map((yg) => (
              <YearRow
                key={yg.year}
                yearGroup={yg}
                maxCount={maxCount}
                maxYearCount={maxYearCount}
                selectedMonth={selectedMonth}
                onSelectMonth={onSelectMonth}
              />
            ))}
          </div>
        </Section>
      </div>
    </aside>
  );
};

export default ArchiveSidebar;
