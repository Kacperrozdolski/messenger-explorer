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
      // Fetch full media items for the result IDs
      const mediaIds = results.map((r) => r.media_id);
      if (mediaIds.length === 0) {
        setAiSearchResults([]);
        return;
      }
      // Fetch all media and filter by AI result IDs, preserving AI ranking order
      const allMedia = await api.getMedia({ sort: "date-desc", limit: 100000 });
      const mediaMap = new Map(allMedia.map((m) => [m.id, m]));
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
    staleTime: 0,
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

  const conversations = useMemo(() =>
    (facets?.conversations ?? []).map((c) => ({
      id: c.id,
      name: c.title,
      type: c.chat_type as "group" | "dm",
      mediaCount: c.media_count,
    })),
    [facets?.conversations],
  );

  const senders = useMemo(() =>
    (facets?.senders ?? []).map((s) => ({
      id: s.id,
      name: s.name,
      mediaCount: s.media_count,
    })),
    [facets?.senders],
  );

  const timeline = useMemo(() =>
    facets?.timeline ?? [],
    [facets?.timeline],
  );

  const fileTypeCounts = facets?.file_type_counts ?? null;

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
    queryClient.invalidateQueries();
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
          resultCount={aiSearchQuery ? (aiSearchResults?.length ?? 0) : totalCount}
          conversations={conversations}
          senders={senders}
          onSelectChat={setSelectedChatId}
          onSelectSender={setSelectedSenderId}
        />

        <div ref={scrollRef} className="flex-1 overflow-y-auto">
          <Gallery
            images={aiSearchQuery ? (aiSearchResults ?? []) : images}
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
