import { useEffect, useRef, useMemo, memo } from "react";
import { useTranslation } from "react-i18next";
import { Loader2 } from "lucide-react";
import type { ImageEntry, ViewMode, AlbumInfo } from "@/data/types";
import ImageCard from "./ImageCard";
import ImageListRow from "./ImageListRow";
import { getLocale } from "@/lib/locale";

interface GalleryProps {
  images: ImageEntry[];
  view: ViewMode;
  onImageClick: (image: ImageEntry) => void;
  albums: AlbumInfo[];
  activeAlbumId: number | null;
  onLoadMore: () => void;
  hasMore: boolean;
  isLoadingMore: boolean;
  scrollContainerRef?: React.RefObject<HTMLDivElement>;
}

const formatMonthYear = (ts: number) => {
  const d = new Date(ts);
  return d.toLocaleString(getLocale(), { month: "long", year: "numeric" });
};

const Gallery = ({ images, view, onImageClick, albums, activeAlbumId, onLoadMore, hasMore, isLoadingMore, scrollContainerRef }: GalleryProps) => {
  const { t } = useTranslation();
  const sentinelRef = useRef<HTMLDivElement>(null);
  const onLoadMoreRef = useRef(onLoadMore);
  onLoadMoreRef.current = onLoadMore;

  // Track whether the sentinel is currently visible so we can re-trigger after loads
  const sentinelVisibleRef = useRef(false);

  // IntersectionObserver for infinite scroll
  // Uses the scroll container as root so it detects scrolling within the overflow div
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    const root = scrollContainerRef?.current ?? null;

    const observer = new IntersectionObserver(
      (entries) => {
        sentinelVisibleRef.current = entries[0].isIntersecting;
        if (entries[0].isIntersecting) {
          onLoadMoreRef.current();
        }
      },
      { root, rootMargin: "400px" },
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [scrollContainerRef]);

  // After a fetch completes, if sentinel is still visible, load more.
  // IntersectionObserver only fires on transitions, so if new content doesn't
  // push the sentinel out of view, it won't fire again on its own.
  useEffect(() => {
    if (!isLoadingMore && hasMore && sentinelVisibleRef.current) {
      onLoadMoreRef.current();
    }
  }, [isLoadingMore, hasMore]);

  const grouped = useMemo(() => {
    const result: Record<string, ImageEntry[]> = {};
    for (const img of images) {
      const key = formatMonthYear(img.timestamp);
      if (!result[key]) result[key] = [];
      result[key].push(img);
    }
    return result;
  }, [images]);


  if (images.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <p className="text-muted-foreground text-sm">{t("gallery.noMatch")}</p>
        <p className="text-[12px] text-muted-foreground/60 mt-1">{t("gallery.noMatchHint")}</p>
      </div>
    );
  }

  return (
    <div className="p-5 space-y-8">
      {Object.entries(grouped).map(([monthYear, items]) => (
        <section key={monthYear}>
          <h2 className="text-[13px] font-semibold text-muted-foreground uppercase tracking-wider mb-3 sticky top-0 bg-background/80 backdrop-blur-sm py-1 z-10">
            {monthYear}
            <span className="ml-2 text-[11px] font-normal text-muted-foreground/60">{t("gallery.photos", { count: items.length })}</span>
          </h2>

          {view === "grid" ? (
            <div className="columns-1 sm:columns-2 xl:columns-3 gap-3">
              {items.map((img) => (
                <ImageCard
                  key={img.id}
                  image={img}
                  onClick={onImageClick}
                  albums={albums}
                  activeAlbumId={activeAlbumId}
                />
              ))}
            </div>
          ) : (
            <div className="space-y-0.5">
              {items.map((img) => (
                <ImageListRow
                  key={img.id}
                  image={img}
                  onClick={onImageClick}
                  albums={albums}
                  activeAlbumId={activeAlbumId}
                />
              ))}
            </div>
          )}
        </section>
      ))}

      {/* Infinite scroll sentinel */}
      <div ref={sentinelRef} className="h-1" />

      {isLoadingMore && (
        <div className="flex justify-center py-6">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      )}

      {!hasMore && images.length > 0 && (
        <p className="text-center text-[12px] text-muted-foreground/50 pb-4">
          {t("gallery.endOfResults", { defaultValue: "All items loaded" })}
        </p>
      )}
    </div>
  );
};

export default memo(Gallery);
