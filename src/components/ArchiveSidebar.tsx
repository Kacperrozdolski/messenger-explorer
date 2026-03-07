import { useState, useMemo, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQueryClient } from "@tanstack/react-query";
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
  FolderHeart,
  Pencil,
  Trash2,
  Palette,
  FileDown,
  Brain,
} from "lucide-react";
import { save } from "@tauri-apps/plugin-dialog";
import { toast } from "sonner";
import type { ChatSource, SenderInfo, FileTypeFilter, AlbumInfo } from "@/data/types";
import type { TimelineEntry, FileTypeCounts } from "@/lib/api";
import * as api from "@/lib/api";
import { cn } from "@/lib/utils";
import { formatMonthKeyLabel, formatMonthKeyFull } from "@/lib/locale";
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
import {
  ContextMenu,
  ContextMenuTrigger,
  ContextMenuContent,
  ContextMenuItem,
} from "@/components/ui/context-menu";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogAction,
  AlertDialogCancel,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import ColorPicker from "@/components/ColorPicker";

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
  fileTypeCounts: FileTypeCounts | null;
  albums: AlbumInfo[];
  selectedAlbumId: number | null;
  onSelectAlbum: (id: number | null) => void;
  searchQuery: string;
  onClearSearch: () => void;
  aiSearchQuery?: string | null;
  onClearAiSearch?: () => void;
}

const TOP_N = 5;

type SectionId = "groups" | "senders" | "mediaType" | "timeline" | "albums";

const SECTION_ORDER: SectionId[] = [
  "groups",
  "senders",
  "mediaType",
  "timeline",
  "albums",
];

const SECTION_ICONS: Record<SectionId, React.ElementType> = {
  groups: Users,
  senders: User,
  mediaType: Image,
  timeline: Calendar,
  albums: FolderHeart,
};

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
                {formatMonthKeyLabel(d.month_key)}
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
  fileTypeCounts,
  albums,
  selectedAlbumId,
  onSelectAlbum,
  searchQuery,
  onClearSearch,
  aiSearchQuery,
  onClearAiSearch,
}: ArchiveSidebarProps) => {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [renamingAlbumId, setRenamingAlbumId] = useState<number | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [deleteAlbumId, setDeleteAlbumId] = useState<number | null>(null);
  const [colorPickerAlbumId, setColorPickerAlbumId] = useState<number | null>(null); 

  const renameAlbum = useMutation({
    mutationFn: ({ id, name }: { id: number; name: string }) =>
      api.renameAlbum(id, name),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["albums"] });
      setRenamingAlbumId(null);
    },
  });

  const updateAlbumColor = useMutation({
    mutationFn: ({ id, color }: { id: number; color: string }) =>
      api.updateAlbumColor(id, color),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["albums"] });
    },
  });

  const deleteAlbum = useMutation({
    mutationFn: (id: number) => api.deleteAlbum(id),
    onSuccess: (_, deletedId) => {
      queryClient.invalidateQueries({ queryKey: ["albums"] });
      queryClient.invalidateQueries({ queryKey: ["media"] });
      if (selectedAlbumId === deletedId) onSelectAlbum(null);
      setDeleteAlbumId(null);
    },
  });

  const [exportingAlbumId, setExportingAlbumId] = useState<number | null>(null);

  const exportAlbumPdf = useMutation({
    mutationFn: async (album: AlbumInfo) => {
      const path = await save({
        defaultPath: `${album.name}.pdf`,
        filters: [{ name: "PDF", extensions: ["pdf"] }],
      });
      if (!path) return null;
      setExportingAlbumId(album.id);
      const result = api.exportAlbumPdf(album.id, path);
      toast.promise(result, {
        loading: t("albums.exporting"),
        success: (r) =>
          t("albums.exportDone", { count: r.exported_count }),
        error: (e) => String(e),
      });
      return result;
    },
    onSettled: () => setExportingAlbumId(null),
  });

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
  const selectedAlbum = selectedAlbumId !== null
    ? albums.find((a) => a.id === selectedAlbumId) ?? null
    : null;

  const hasActiveFilters =
    selectedChat !== null ||
    selectedSender !== null ||
    fileType !== "all" ||
    selectedMonth !== null ||
    selectedAlbumId !== null ||
    searchQuery !== "" ||
    !!aiSearchQuery;

  const selectedMonthLabel = selectedMonth
    ? formatMonthKeyFull(selectedMonth)
    : null;

  const SECTION_TITLES: Record<SectionId, string> = {
    groups: t("sidebar.groups"),
    senders: t("sidebar.senders"),
    mediaType: t("sidebar.mediaType"),
    timeline: t("sidebar.timeline"),
    albums: t("sidebar.albums"),
  };

  const renderSection = (id: SectionId) => {
    switch (id) {
      case "groups":
        return (
          <Section key={id} title={SECTION_TITLES[id]} icon={SECTION_ICONS[id]}>
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
                placeholder={t("sidebar.searchGroups")}
                browseLabel={t("sidebar.browseAll", { count: allSorted.length })}
                noResultsLabel={t("sidebar.noResults")}
              />
            )}
          </Section>
        );

      case "senders":
        return (
          <Section key={id} title={SECTION_TITLES[id]} icon={SECTION_ICONS[id]}>
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
          </Section>
        );

      case "mediaType":
        return (
          <Section key={id} title={SECTION_TITLES[id]} icon={SECTION_ICONS[id]}>
            {(["all", "image", "video", "gif"] as FileTypeFilter[]).map((ft) => {
              const count = ft === "all"
                ? fileTypeCounts ? fileTypeCounts.image + fileTypeCounts.video + fileTypeCounts.gif : null
                : fileTypeCounts ? fileTypeCounts[ft] : null;
              return (
                <button
                  key={ft}
                  onClick={() => onFileTypeChange(ft)}
                  className={cn(
                    "flex items-center justify-between w-full px-3 py-1.5 text-[13px] rounded-md transition-colors capitalize",
                    fileType === ft
                      ? "bg-sidebar-accent text-sidebar-accent-foreground"
                      : "text-sidebar-foreground hover:bg-sidebar-accent/50",
                  )}
                >
                  <span className="flex items-center gap-2">
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
                  </span>
                  {count !== null && (
                    <span className="text-[11px] bg-secondary px-1.5 py-0.5 rounded-full text-secondary-foreground">
                      {count}
                    </span>
                  )}
                </button>
              );
            })}
          </Section>
        );

      case "timeline":
        return (
          <Section key={id} title={SECTION_TITLES[id]} icon={SECTION_ICONS[id]}>
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
        );

      case "albums":
        return (
          <Section key={id} title={SECTION_TITLES[id]} icon={SECTION_ICONS[id]}>
            {albums.length === 0 ? (
              <p className="px-3 py-2 text-[11px] text-muted-foreground">
                {t("albums.empty")}
              </p>
            ) : (
              albums.map((album) => (
                <ContextMenu key={album.id}>
                  <ContextMenuTrigger asChild>
                    {renamingAlbumId === album.id ? (
                      <form
                        className="px-3 py-1"
                        onSubmit={(e) => {
                          e.preventDefault();
                          const trimmed = renameValue.trim();
                          if (trimmed) renameAlbum.mutate({ id: album.id, name: trimmed });
                        }}
                      >
                        <Input
                          value={renameValue}
                          onChange={(e) => setRenameValue(e.target.value)}
                          onBlur={() => setRenamingAlbumId(null)}
                          onKeyDown={(e) => { if (e.key === "Escape") setRenamingAlbumId(null); }}
                          className="h-7 text-[13px]"
                          autoFocus
                        />
                      </form>
                    ) : (
                      <button
                        onClick={() =>
                          onSelectAlbum(selectedAlbumId === album.id ? null : album.id)
                        }
                        className={cn(
                          "flex items-center gap-2 w-full px-3 py-1.5 text-[13px] rounded-md transition-colors",
                          selectedAlbumId === album.id
                            ? "bg-sidebar-accent text-sidebar-accent-foreground"
                            : "text-sidebar-foreground hover:bg-sidebar-accent/50",
                        )}
                      >
                        <span
                          className="h-3 w-3 rounded-full shrink-0"
                          style={{ backgroundColor: album.color }}
                        />
                        <span className="truncate flex-1 text-left">{album.name}</span>
                        <span className="text-[11px] bg-secondary px-1.5 py-0.5 rounded-full text-secondary-foreground">
                          {album.mediaCount}
                        </span>
                      </button>
                    )}
                  </ContextMenuTrigger>
                  <ContextMenuContent>
                    <ContextMenuItem
                      onSelect={() => {
                        setRenamingAlbumId(album.id);
                        setRenameValue(album.name);
                      }}
                    >
                      <Pencil className="h-4 w-4 mr-2" />
                      {t("albums.rename")}
                    </ContextMenuItem>
                    <ContextMenuItem
                      onSelect={() => setColorPickerAlbumId(album.id)}
                    >
                      <Palette className="h-4 w-4 mr-2" />
                      {t("albums.changeColor")}
                    </ContextMenuItem>
                    <ContextMenuItem
                      onSelect={() => exportAlbumPdf.mutate(album)}
                      disabled={exportingAlbumId !== null}
                    >
                      <FileDown className="h-4 w-4 mr-2" />
                      {exportingAlbumId === album.id
                        ? t("albums.exporting")
                        : t("albums.exportPdf")}
                    </ContextMenuItem>
                    <ContextMenuItem
                      onSelect={() => setDeleteAlbumId(album.id)}
                      className="text-destructive focus:text-destructive"
                    >
                      <Trash2 className="h-4 w-4 mr-2" />
                      {t("albums.delete")}
                    </ContextMenuItem>
                  </ContextMenuContent>
                </ContextMenu>
              ))
            )}
          </Section>
        );
    }
  };

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
        <div className="px-3 py-2 border-b border-sidebar-border bg-sidebar">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
              {t("sidebar.activeFilters")}
            </span>
            <button
              onClick={() => {
                onSelectChat(null);
                onSelectSender(null);
                onFileTypeChange("all");
                onSelectMonth(null);
                onSelectAlbum(null);
                onClearSearch();
                onClearAiSearch?.();
              }}
              className="text-[11px] text-muted-foreground hover:text-destructive transition-colors"
            >
              {t("sidebar.clearAll")}
            </button>
          </div>
          <div className="flex flex-wrap gap-1.5">
          {selectedSource && (
            <Badge
              variant="secondary"
              className="text-[11px] px-2 py-0.5 gap-1"
            >
              <Users className="h-3 w-3 shrink-0" />
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
              <User className="h-3 w-3 shrink-0" />
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
              {fileType === "image" ? (
                <Image className="h-3 w-3 shrink-0" />
              ) : fileType === "video" ? (
                <Video className="h-3 w-3 shrink-0" />
              ) : (
                <Sparkles className="h-3 w-3 shrink-0" />
              )}
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
              <Calendar className="h-3 w-3 shrink-0" />
              {selectedMonthLabel}
              <button
                onClick={() => onSelectMonth(null)}
                className="ml-0.5 hover:text-destructive"
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          )}
          {selectedAlbum && (
            <Badge
              variant="secondary"
              className="text-[11px] px-2 py-0.5 gap-1"
            >
              <span
                className="h-2 w-2 rounded-full shrink-0"
                style={{ backgroundColor: selectedAlbum.color }}
              />
              {selectedAlbum.name}
              <button
                onClick={() => onSelectAlbum(null)}
                className="ml-0.5 hover:text-destructive"
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          )}
          {searchQuery && (
            <Badge
              variant="secondary"
              className="text-[11px] px-2 py-0.5 gap-1"
            >
              <Search className="h-3 w-3 shrink-0" />
              {searchQuery}
              <button
                onClick={onClearSearch}
                className="ml-0.5 hover:text-destructive"
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          )}
          {aiSearchQuery && (
            <Badge
              variant="secondary"
              className="text-[11px] px-2 py-0.5 gap-1"
            >
              <Brain className="h-3 w-3 shrink-0" />
              AI: {aiSearchQuery}
              <button
                onClick={onClearAiSearch}
                className="ml-0.5 hover:text-destructive"
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          )}
          </div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto py-2">
        {SECTION_ORDER.map(renderSection)}
      </div>

      <AlertDialog
        open={deleteAlbumId !== null}
        onOpenChange={(open) => { if (!open) setDeleteAlbumId(null); }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("albums.deleteConfirm")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("albums.deleteConfirmDesc")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("albums.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => { if (deleteAlbumId !== null) deleteAlbum.mutate(deleteAlbumId); }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {t("albums.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog
        open={colorPickerAlbumId !== null}
        onOpenChange={(open) => { if (!open) setColorPickerAlbumId(null); }}
      >
        <DialogContent className="sm:max-w-xs">
          <DialogHeader>
            <DialogTitle>{t("albums.changeColor")}</DialogTitle>
            <DialogDescription />
          </DialogHeader>
          {colorPickerAlbumId !== null && (() => {
            const album = albums.find((a) => a.id === colorPickerAlbumId);
            if (!album) return null;
            return (
              <ColorPicker
                value={album.color}
                onChange={(color) => {
                  updateAlbumColor.mutate({ id: colorPickerAlbumId, color });
                  setColorPickerAlbumId(null);
                }}
              />
            );
          })()}
        </DialogContent>
      </Dialog>
    </aside>
  );
};

export default ArchiveSidebar;
