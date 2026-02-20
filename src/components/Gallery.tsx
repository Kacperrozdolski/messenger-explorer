import { useTranslation } from "react-i18next";
import type { ImageEntry, ViewMode } from "@/data/types";
import ImageCard from "./ImageCard";
import ImageListRow from "./ImageListRow";

interface GalleryProps {
  images: ImageEntry[];
  view: ViewMode;
  onImageClick: (image: ImageEntry) => void;
}

const formatMonthYear = (ts: number) => {
  const d = new Date(ts);
  return d.toLocaleString("en-US", { month: "long", year: "numeric" });
};

const Gallery = ({ images, view, onImageClick }: GalleryProps) => {
  const { t } = useTranslation();

  if (images.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <p className="text-muted-foreground text-sm">{t("gallery.noMatch")}</p>
        <p className="text-[12px] text-muted-foreground/60 mt-1">{t("gallery.noMatchHint")}</p>
      </div>
    );
  }

  // Group by month/year
  const grouped: Record<string, ImageEntry[]> = {};
  images.forEach((img) => {
    const key = formatMonthYear(img.timestamp);
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(img);
  });

  let globalIndex = 0;

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
              {items.map((img) => {
                const idx = globalIndex++;
                return (
                  <ImageCard
                    key={img.id}
                    image={img}
                    index={idx}
                    onClick={() => onImageClick(img)}
                  />
                );
              })}
            </div>
          ) : (
            <div className="space-y-0.5">
              {items.map((img) => {
                const idx = globalIndex++;
                return (
                  <ImageListRow
                    key={img.id}
                    image={img}
                    index={idx}
                    onClick={() => onImageClick(img)}
                  />
                );
              })}
            </div>
          )}
        </section>
      ))}
    </div>
  );
};

export default Gallery;
