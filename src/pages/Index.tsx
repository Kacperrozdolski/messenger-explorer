import { useMemo, useState } from "react";
import ArchiveSidebar from "@/components/ArchiveSidebar";
import TopBar from "@/components/TopBar";
import Gallery from "@/components/Gallery";
import ContextModal from "@/components/ContextModal";
import { imageEntries, type SortOption, type ViewMode, type FileTypeFilter, type ImageEntry } from "@/data/messages";

const Index = () => {
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<SortOption>("date-desc");
  const [view, setView] = useState<ViewMode>("grid");
  const [selectedChat, setSelectedChat] = useState<string | null>(null);
  const [selectedSender, setSelectedSender] = useState<string | null>(null);
  const [fileType, setFileType] = useState<FileTypeFilter>("all");
  const [selectedMonth, setSelectedMonth] = useState<string | null>(null);
  const [modalImage, setModalImage] = useState<ImageEntry | null>(null);

  // Build timeline data
  const timelineData = useMemo(() => {
    const counts: Record<string, number> = {};
    imageEntries.forEach((img) => {
      const d = new Date(img.timestamp);
      const key = `${d.toLocaleString("en-US", { month: "short" })} ${d.getFullYear()}`;
      counts[key] = (counts[key] || 0) + 1;
    });
    // Sort chronologically
    const entries = Object.entries(counts).sort((a, b) => {
      const parseKey = (k: string) => new Date(k);
      return parseKey(b[0]).getTime() - parseKey(a[0]).getTime();
    });
    return entries.map(([label, count]) => ({ label, count }));
  }, []);

  const filtered = useMemo(() => {
    let result = imageEntries.filter((img) => {
      if (selectedChat && img.chat !== selectedChat) return false;
      if (selectedSender && img.sender !== selectedSender) return false;
      if (fileType !== "all" && img.fileType !== fileType) return false;
      if (selectedMonth) {
        const d = new Date(img.timestamp);
        const key = `${d.toLocaleString("en-US", { month: "short" })} ${d.getFullYear()}`;
        if (key !== selectedMonth) return false;
      }
      if (search) {
        const q = search.toLowerCase();
        const matchSender = img.sender.toLowerCase().includes(q);
        const matchChat = img.chat.toLowerCase().includes(q);
        const matchContext = [...img.contextBefore, ...img.contextAfter].some((m) =>
          m.text.toLowerCase().includes(q) || m.sender.toLowerCase().includes(q)
        );
        const matchDate = img.timestamp.includes(q);
        if (!matchSender && !matchChat && !matchContext && !matchDate) return false;
      }
      return true;
    });

    // Sort
    if (sort === "date-desc") result.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    else if (sort === "date-asc") result.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
    else result.sort((a, b) => a.sender.localeCompare(b.sender));

    return result;
  }, [search, sort, selectedChat, selectedSender, fileType, selectedMonth]);

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <ArchiveSidebar
        selectedChat={selectedChat}
        onSelectChat={setSelectedChat}
        selectedSender={selectedSender}
        onSelectSender={setSelectedSender}
        fileType={fileType}
        onFileTypeChange={setFileType}
        selectedMonth={selectedMonth}
        onSelectMonth={setSelectedMonth}
        timelineData={timelineData}
      />

      <div className="flex-1 flex flex-col min-w-0">
        <TopBar
          search={search}
          onSearchChange={setSearch}
          sort={sort}
          onSortChange={setSort}
          view={view}
          onViewChange={setView}
          resultCount={filtered.length}
        />

        <div className="flex-1 overflow-y-auto">
          <Gallery images={filtered} view={view} onImageClick={setModalImage} />
        </div>
      </div>

      {modalImage && <ContextModal image={modalImage} onClose={() => setModalImage(null)} />}
    </div>
  );
};

export default Index;
