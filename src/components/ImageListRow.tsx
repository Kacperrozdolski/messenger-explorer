import { memo, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { MessageCircle } from "lucide-react";
import type { ImageEntry, AlbumInfo } from "@/data/types";
import AlbumContextMenu from "./AlbumContextMenu";
import AlbumPickerButton from "./AlbumPickerButton";
import { getLocale } from "@/lib/locale";

interface ImageListRowProps {
  image: ImageEntry;
  onClick: (image: ImageEntry) => void;
  albums: AlbumInfo[];
  activeAlbumId: number | null;
}

const formatTime = (ts: number) => {
  const d = new Date(ts);
  return d.toLocaleString(getLocale(), { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
};

const ImageListRow = ({ image, onClick, albums, activeAlbumId }: ImageListRowProps) => {
  const { t } = useTranslation();
  const handleClick = useCallback(() => onClick(image), [onClick, image]);
  return (
    <AlbumContextMenu
      mediaId={image.id}
      filePath={image.file_path}
      albums={albums}
      activeAlbumId={activeAlbumId}
      onShowContext={handleClick}
    >
      <button
        onClick={handleClick}
        className="flex items-center gap-4 w-full px-4 py-2.5 rounded-md hover:bg-accent/50 transition-colors text-left animate-fade-in"
      >
        {image.fileType === "video" ? (
          <video
            src={image.src}
            className="h-12 w-12 rounded object-cover shrink-0"
            muted
            preload="metadata"
          />
        ) : (
          <img
            src={image.src}
            alt={t("gallery.photoBy", { sender: image.sender })}
            className="h-12 w-12 rounded object-cover shrink-0"
            loading="lazy"
          />
        )}
        <div className="flex-1 min-w-0">
          <p className="text-[13px] font-medium text-foreground truncate">{image.sender}</p>
          <p className="text-[11px] text-muted-foreground">{image.chat}</p>
        </div>
        <p className="text-[11px] text-muted-foreground whitespace-nowrap">{formatTime(image.timestamp)}</p>
        <AlbumPickerButton
          mediaId={image.id}
          albums={albums}
          className="flex items-center justify-center h-7 w-7 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors shrink-0"
        />
        <MessageCircle className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
      </button>
    </AlbumContextMenu>
  );
};

export default memo(ImageListRow);
