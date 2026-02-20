import { useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { open } from "@tauri-apps/plugin-dialog";
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

const Index = () => {
  const queryClient = useQueryClient();

  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [sort, setSort] = useState<SortOption>("date-desc");
  const [view, setView] = useState<ViewMode>("grid");
  const [selectedChatId, setSelectedChatId] = useState<number | null>(null);
  const [selectedSenderId, setSelectedSenderId] = useState<number | null>(null);
  const [fileType, setFileType] = useState<FileTypeFilter>("all");
  const [selectedMonth, setSelectedMonth] = useState<string | null>(null);
  const [modalImage, setModalImage] = useState<ImageEntry | null>(null);
  const [addingSource, setAddingSource] = useState(false);

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  // Check if we have data
  const { data: status, isLoading: statusLoading } = useQuery({
    queryKey: ["import-status"],
    queryFn: api.getImportStatus,
  });

  const hasData = status?.has_data ?? false;

  // Sidebar data
  const { data: conversations = [] } = useQuery({
    queryKey: ["conversations"],
    queryFn: api.getConversations,
    enabled: hasData,
  });

  const { data: senders = [] } = useQuery({
    queryKey: ["senders"],
    queryFn: api.getSenders,
    enabled: hasData,
  });

  const { data: timeline = [] } = useQuery({
    queryKey: ["timeline"],
    queryFn: api.getTimeline,
    enabled: hasData,
  });

  // Main media query
  const { data: images = [] } = useQuery({
    queryKey: [
      "media",
      selectedChatId,
      selectedSenderId,
      fileType,
      selectedMonth,
      debouncedSearch,
      sort,
    ],
    queryFn: () =>
      api.getMedia({
        conversationId: selectedChatId ?? undefined,
        senderId: selectedSenderId ?? undefined,
        fileType: fileType === "all" ? undefined : fileType,
        month: selectedMonth ?? undefined,
        search: debouncedSearch || undefined,
        sort,
      }),
    enabled: hasData,
  });

  const handleImportComplete = () => {
    queryClient.invalidateQueries();
  };

  const handleAddSource = async () => {
    try {
      const selected = await open({
        directory: true,
        title: "Select Export Folder to Add",
      });
      if (!selected) return;

      setAddingSource(true);
      const result = await api.addSource(selected as string);
      queryClient.invalidateQueries();

      // Brief log — could be replaced with a toast
      console.log(
        `Added source: ${result.conversations} conversations, ${result.media} media`
      );
    } catch (e) {
      console.error("Failed to add source:", e);
    } finally {
      setAddingSource(false);
    }
  };

  if (statusLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <p className="text-sm text-muted-foreground">Loading...</p>
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
        onAddSource={handleAddSource}
        addingSource={addingSource}
      />

      <div className="flex-1 flex flex-col min-w-0">
        <TopBar
          search={search}
          onSearchChange={setSearch}
          sort={sort}
          onSortChange={setSort}
          view={view}
          onViewChange={setView}
          resultCount={images.length}
        />

        <div className="flex-1 overflow-y-auto">
          <Gallery images={images} view={view} onImageClick={setModalImage} />
        </div>
      </div>

      {modalImage && (
        <ContextModal image={modalImage} onClose={() => setModalImage(null)} />
      )}
    </div>
  );
};

export default Index;
