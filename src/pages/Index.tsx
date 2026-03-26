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
const MONTHS_PER_PAGE = 3;

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

  const handleSearchCommit = useCallback((query: string) => {
    setCommittedSearch(query);
    setSearch("");
  }, []);

  const handleClearSearch = useCallback(() => {
    setCommittedSearch("");
  }, []);

  const handleModalClose = useCallback(() => {
    setModalImage(null);
  }, []);

  // Check if we have data
  const { data: status, isLoading: statusLoading } = useQuery({
    queryKey: ["import-status"],
    queryFn: api.getImportStatus,
    staleTime: 30_000,
  });

  const hasData = status?.has_data ?? false;

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
    staleTime: 2_000,
  });

  const conversations = useMemo(() => {
    return (facets?.conversations ?? []).map((c) => ({
      id: c.id,
      name: c.title,
      type: c.chat_type as "group" | "dm",
      mediaCount: c.media_count,
    }));
  }, [facets?.conversations]);

  const senders = useMemo(() => {
    return (facets?.senders ?? []).map((s) => ({
      id: s.id,
      name: s.name,
      mediaCount: s.media_count,
    }));
  }, [facets?.senders]);

  const timeline = useMemo(() => {
    return facets?.timeline ?? [];
  }, [facets?.timeline]);

  const fileTypeCounts: FileTypeCounts | null = useMemo(() => {
    return facets?.file_type_counts ?? null;
  }, [facets?.file_type_counts]);

  const { data: albums = [] } = useQuery({
    queryKey: ["albums"],
    queryFn: api.getAlbums,
    enabled: hasData,
    staleTime: 30_000,
  });

  // Derive total count from facets (image + video + gif)
  const totalCount = useMemo(() => {
    if (!fileTypeCounts) return 0;
    return fileTypeCounts.image + fileTypeCounts.video + fileTypeCounts.gif;
  }, [fileTypeCounts]);

  // Use month-based pagination for date sorts (no month filter),
  // offset-based for sender sort or when a specific month is selected.
  const useMonthPagination = (sort === "date-desc" || sort === "date-asc") && !selectedMonth;

  // Month-based infinite scroll query
  const {
    data: monthMediaData,
    fetchNextPage: fetchNextMonthPage,
    hasNextPage: hasNextMonthPage,
    isFetchingNextPage: isFetchingNextMonthPage,
  } = useInfiniteQuery({
    queryKey: [
      "media-month",
      selectedChatId,
      selectedSenderId,
      fileType,
      committedSearch,
      sort,
      selectedAlbumId,
    ],
    queryFn: ({ pageParam }: { pageParam: string | undefined }) =>
      api.getMediaPage({
        ...filterParams,
        sort,
        cursorMonth: pageParam,
        monthsPerPage: MONTHS_PER_PAGE,
      }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    enabled: hasData && useMonthPagination,
    placeholderData: keepPreviousData,
    staleTime: 10_000,
  });

  // Offset-based infinite scroll query (for sender sort or specific month filter)
  const {
    data: offsetMediaData,
    fetchNextPage: fetchNextOffsetPage,
    hasNextPage: hasNextOffsetPage,
    isFetchingNextPage: isFetchingNextOffsetPage,
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
    enabled: hasData && !useMonthPagination,
    placeholderData: keepPreviousData,
    staleTime: 10_000,
  });

  const mediaData = useMonthPagination ? monthMediaData : offsetMediaData;
  const fetchNextPage = useMonthPagination ? fetchNextMonthPage : fetchNextOffsetPage;
  const hasNextPage = useMonthPagination ? hasNextMonthPage : hasNextOffsetPage;
  const isFetchingNextPage = useMonthPagination ? isFetchingNextMonthPage : isFetchingNextOffsetPage;

  const images = useMemo(
    () => {
      if (useMonthPagination) {
        return monthMediaData?.pages.flatMap((p) => p.items) ?? [];
      }
      return offsetMediaData?.pages.flat() ?? [];
    },
    [useMonthPagination, monthMediaData, offsetMediaData],
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
    queryClient.invalidateQueries({ queryKey: ["media-month"] });
    queryClient.invalidateQueries({ queryKey: ["filter-facets"] });
    queryClient.invalidateQueries({ queryKey: ["albums"] });
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
      />

      <div className="flex-1 flex flex-col min-w-0">
        <TopBar
          search={search}
          onSearchChange={setSearch}
          onSearchCommit={handleSearchCommit}
          sort={sort}
          onSortChange={setSort}
          view={view}
          onViewChange={setView}
          resultCount={totalCount}
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
            images={images}
            view={view}
            onImageClick={setModalImage}
            albums={albums}
            activeAlbumId={selectedAlbumId}
            onLoadMore={handleLoadMore}
            hasMore={hasNextPage ?? false}
            isLoadingMore={isFetchingNextPage}
            scrollContainerRef={scrollRef}
          />
        </div>
      </div>

      {modalImage && (
        <ContextModal image={modalImage} onClose={handleModalClose} />
      )}
    </div>
  );
};

export default Index;
