import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useInfiniteQuery, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import { convertFileSrc } from "@tauri-apps/api/core";
import ArchiveSidebar from "@/components/ArchiveSidebar";
import TopBar from "@/components/TopBar";
import Gallery from "@/components/Gallery";
import ContextModal from "@/components/ContextModal";
import ImportDialog from "@/components/ImportDialog";
import * as api from "@/lib/api";
import type {
  SortOption,
  ViewMode,
  FileTypeFilter,
  ImageEntry,
} from "@/data/types";
import type { FileTypeCounts } from "@/lib/api";

const PAGE_SIZE = 60;

const Index = () => {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const scrollRef = useRef<HTMLDivElement>(null);

  const [search, setSearch] = useState("");
  const [committedSearch, setCommittedSearch] = useState("");
  const [sort, setSort] = useState<SortOption>("date-desc");
  const [view, setView] = useState<ViewMode>("grid");
  const [selectedChatId, setSelectedChatId] = useState<number | null>(null);
  const [selectedSenderId, setSelectedSenderId] = useState<number | null>(null);
  const [fileType, setFileType] = useState<FileTypeFilter>("all");
  const [selectedMonth, setSelectedMonth] = useState<string | null>(null);
  const [selectedAlbumId, setSelectedAlbumId] = useState<number | null>(null);
  const [modalImage, setModalImage] = useState<ImageEntry | null>(null);
  const [aiSearchQuery, setAiSearchQuery] = useState<string | null>(null);
  const [aiSearchResults, setAiSearchResults] = useState<ImageEntry[] | null>(null);

  const handleAiSearch = useCallback(async (query: string) => {
    setAiSearchQuery(query);
    setSearch("");
    try {
      const results = await api.aiSearch(query, 200);
      const mediaIds = results.map((r) => r.media_id);
      if (mediaIds.length === 0) {
        setAiSearchResults([]);
        return;
      }
      // Fetch only the specific media items by ID, preserving AI ranking order
      const mediaItems = await api.getMediaByIds(mediaIds);
      const mediaMap = new Map(mediaItems.map((m) => [m.id, m]));
      const ranked = mediaIds
        .map((id) => mediaMap.get(id))
        .filter((m): m is ImageEntry => m !== undefined);
      setAiSearchResults(ranked);
    } catch (e) {
      console.error("AI search failed:", e);
      setAiSearchResults([]);
    }
  }, []);

  const handleClearAiSearch = useCallback(() => {
    setAiSearchQuery(null);
    setAiSearchResults(null);
  }, []);

  const handleSearchCommit = useCallback((query: string) => {
    setCommittedSearch(query);
    setSearch("");
    handleClearAiSearch();
  }, [handleClearAiSearch]);

  const handleClearSearch = useCallback(() => {
    setCommittedSearch("");
  }, []);

  // Check if we have data
  const { data: status, isLoading: statusLoading } = useQuery({
    queryKey: ["import-status"],
    queryFn: api.getImportStatus,
  });

  const hasData = status?.has_data ?? false;

  // Check if AI search is available (has indexed images)
  const { data: indexingStatus } = useQuery({
    queryKey: ["indexing-status"],
    queryFn: api.getIndexingStatus,
    enabled: hasData,
    staleTime: 5000,
  });

  const aiSearchAvailable = (indexingStatus?.indexed ?? 0) > 0;

  // Shared filter params
  const filterParams = useMemo(() => ({
    conversationId: selectedChatId ?? undefined,
    senderId: selectedSenderId ?? undefined,
    fileType: fileType === "all" ? undefined : fileType,
    month: selectedMonth ?? undefined,
    search: committedSearch || undefined,
    albumId: selectedAlbumId ?? undefined,
  }), [selectedChatId, selectedSenderId, fileType, selectedMonth, committedSearch, selectedAlbumId]);

  // Faceted sidebar data - updates when filters change
  const { data: facets } = useQuery({
    queryKey: [
      "filter-facets",
      selectedChatId,
      selectedSenderId,
      fileType,
      selectedMonth,
      committedSearch,
      selectedAlbumId,
    ],
    queryFn: () => api.getFilterFacets(filterParams),
    enabled: hasData,
    placeholderData: keepPreviousData,
  });

  // Client-side filtering & facets for AI search results
  const aiFilteredResults = useMemo(() => {
    if (!aiSearchResults) return null;
    return aiSearchResults.filter((m) => {
      if (selectedChatId != null && m.chatId !== selectedChatId) return false;
      if (selectedSenderId != null && m.senderId !== selectedSenderId) return false;
      if (fileType !== "all" && m.fileType !== fileType) return false;
      if (selectedMonth != null) {
        const d = new Date(m.timestamp);
        const y = d.getUTCFullYear().toString();
        const ym = `${y}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
        if (selectedMonth.length === 4 ? y !== selectedMonth : ym !== selectedMonth) return false;
      }
      return true;
    });
  }, [aiSearchResults, selectedChatId, selectedSenderId, fileType, selectedMonth]);

  const aiFacets = useMemo(() => {
    if (!aiSearchResults) return null;
    // Compute facets from the full AI results (not filtered by the dimension being faceted)
    const convMap = new Map<number, { name: string; type: string; count: number }>();
    const senderMap = new Map<number, { name: string; count: number }>();
    const monthMap = new Map<string, number>();
    const ftMap: Record<string, number> = { image: 0, video: 0, gif: 0 };

    // For facets, apply all filters EXCEPT the one being faceted (like the backend does)
    const applyFilters = (item: ImageEntry, exclude: string) => {
      if (exclude !== "conversation" && selectedChatId != null && item.chatId !== selectedChatId) return false;
      if (exclude !== "sender" && selectedSenderId != null && item.senderId !== selectedSenderId) return false;
      if (exclude !== "fileType" && fileType !== "all" && item.fileType !== fileType) return false;
      if (exclude !== "month" && selectedMonth != null) {
        const d = new Date(item.timestamp);
        const y = d.getUTCFullYear().toString();
        const ym = `${y}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
        if (selectedMonth.length === 4 ? y !== selectedMonth : ym !== selectedMonth) return false;
      }
      return true;
    };

    for (const m of aiSearchResults) {
      if (applyFilters(m, "conversation")) {
        const prev = convMap.get(m.chatId);
        convMap.set(m.chatId, { name: m.chat, type: m.chatType, count: (prev?.count ?? 0) + 1 });
      }
      if (applyFilters(m, "sender")) {
        const prev = senderMap.get(m.senderId);
        senderMap.set(m.senderId, { name: m.sender, count: (prev?.count ?? 0) + 1 });
      }
      if (applyFilters(m, "month")) {
        const d = new Date(m.timestamp);
        const ym = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
        monthMap.set(ym, (monthMap.get(ym) ?? 0) + 1);
      }
      if (applyFilters(m, "fileType")) {
        ftMap[m.fileType] = (ftMap[m.fileType] ?? 0) + 1;
      }
    }

    return { convMap, senderMap, monthMap, ftMap };
  }, [aiSearchResults, selectedChatId, selectedSenderId, fileType, selectedMonth]);

  const conversations = useMemo(() => {
    if (aiFacets) {
      return Array.from(aiFacets.convMap.entries())
        .map(([id, { name, type, count }]) => ({ id, name, type: type as "group" | "dm", mediaCount: count }))
        .sort((a, b) => a.name.localeCompare(b.name));
    }
    return (facets?.conversations ?? []).map((c) => ({
      id: c.id,
      name: c.title,
      type: c.chat_type as "group" | "dm",
      mediaCount: c.media_count,
    }));
  }, [facets?.conversations, aiFacets]);

  const senders = useMemo(() => {
    if (aiFacets) {
      return Array.from(aiFacets.senderMap.entries())
        .map(([id, { name, count }]) => ({ id, name, mediaCount: count }))
        .sort((a, b) => a.name.localeCompare(b.name));
    }
    return (facets?.senders ?? []).map((s) => ({
      id: s.id,
      name: s.name,
      mediaCount: s.media_count,
    }));
  }, [facets?.senders, aiFacets]);

  const timeline = useMemo(() => {
    if (aiFacets) {
      return Array.from(aiFacets.monthMap.entries())
        .map(([month_key, count]) => ({ label: month_key, month_key, count }))
        .sort((a, b) => b.month_key.localeCompare(a.month_key));
    }
    return facets?.timeline ?? [];
  }, [facets?.timeline, aiFacets]);

  const fileTypeCounts: FileTypeCounts | null = aiFacets
    ? { image: aiFacets.ftMap.image ?? 0, video: aiFacets.ftMap.video ?? 0, gif: aiFacets.ftMap.gif ?? 0 }
    : facets?.file_type_counts ?? null;

  const { data: albums = [] } = useQuery({
    queryKey: ["albums"],
    queryFn: api.getAlbums,
    enabled: hasData,
  });

  // Total count query for the top bar
  const { data: totalCount = 0 } = useQuery({
    queryKey: [
      "media-count",
      selectedChatId,
      selectedSenderId,
      fileType,
      selectedMonth,
      committedSearch,
      selectedAlbumId,
    ],
    queryFn: () => api.getMediaCount(filterParams),
    enabled: hasData,
    placeholderData: keepPreviousData,
  });

  // Infinite scroll media query
  const {
    data: mediaData,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery({
    queryKey: [
      "media",
      selectedChatId,
      selectedSenderId,
      fileType,
      selectedMonth,
      committedSearch,
      sort,
      selectedAlbumId,
    ],
    queryFn: ({ pageParam = 0 }) =>
      api.getMedia({
        ...filterParams,
        sort,
        limit: PAGE_SIZE,
        offset: pageParam,
      }),
    initialPageParam: 0,
    getNextPageParam: (lastPage, allPages) => {
      if (lastPage.length < PAGE_SIZE) return undefined;
      return allPages.reduce((sum, page) => sum + page.length, 0);
    },
    enabled: hasData,
    placeholderData: keepPreviousData,
  });

  const images = useMemo(
    () => mediaData?.pages.flat() ?? [],
    [mediaData],
  );

  // Scroll to top when filters change
  useEffect(() => {
    scrollRef.current?.scrollTo(0, 0);
  }, [selectedChatId, selectedSenderId, fileType, selectedMonth, committedSearch, sort, selectedAlbumId]);

  const handleLoadMore = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage) {
      fetchNextPage();
    }
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  const handleImportComplete = () => {
    queryClient.invalidateQueries({ queryKey: ["import-status"] });
    queryClient.invalidateQueries({ queryKey: ["media"] });
    queryClient.invalidateQueries({ queryKey: ["media-count"] });
    queryClient.invalidateQueries({ queryKey: ["filter-facets"] });
    queryClient.invalidateQueries({ queryKey: ["albums"] });
    queryClient.invalidateQueries({ queryKey: ["indexing-status"] });
  };

  if (statusLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
      </div>
    );
  }

  if (!hasData) {
    return <ImportDialog onImportComplete={handleImportComplete} />;
  }

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <ArchiveSidebar
        conversations={conversations}
        senders={senders}
        selectedChat={selectedChatId}
        onSelectChat={setSelectedChatId}
        selectedSender={selectedSenderId}
        onSelectSender={setSelectedSenderId}
        fileType={fileType}
        onFileTypeChange={setFileType}
        selectedMonth={selectedMonth}
        onSelectMonth={setSelectedMonth}
        timelineData={timeline}
        fileTypeCounts={fileTypeCounts}
        albums={albums}
        selectedAlbumId={selectedAlbumId}
        onSelectAlbum={setSelectedAlbumId}
        searchQuery={committedSearch}
        onClearSearch={handleClearSearch}
        aiSearchQuery={aiSearchQuery}
        onClearAiSearch={handleClearAiSearch}
      />

      <div className="flex-1 flex flex-col min-w-0">
        <TopBar
          search={search}
          onSearchChange={setSearch}
          onSearchCommit={handleSearchCommit}
          onAiSearch={handleAiSearch}
          onClearAiSearch={handleClearAiSearch}
          aiSearchAvailable={aiSearchAvailable}
          aiSearchQuery={aiSearchQuery}
          sort={sort}
          onSortChange={setSort}
          view={view}
          onViewChange={setView}
          resultCount={aiSearchQuery ? (aiFilteredResults?.length ?? 0) : totalCount}
          conversations={conversations}
          senders={senders}
          onSelectChat={setSelectedChatId}
          onSelectSender={setSelectedSenderId}
          onFileTypeChange={setFileType}
          onSelectMonth={setSelectedMonth}
          timelineData={timeline}
        />

        <div ref={scrollRef} className="flex-1 overflow-y-auto">
          <Gallery
            images={aiSearchQuery ? (aiFilteredResults ?? []) : images}
            view={view}
            onImageClick={setModalImage}
            albums={albums}
            activeAlbumId={selectedAlbumId}
            onLoadMore={handleLoadMore}
            hasMore={hasNextPage ?? false}
            isLoadingMore={isFetchingNextPage}
          />
        </div>
      </div>

      {modalImage && (
        <ContextModal image={modalImage} onClose={() => setModalImage(null)} />
      )}
    </div>
  );
};

export default Index;
