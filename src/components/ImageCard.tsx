import { memo, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { MessageCircle, Play } from "lucide-react";
import type { ImageEntry, AlbumInfo } from "@/data/types";
import AlbumContextMenu from "./AlbumContextMenu";
import AlbumPickerButton from "./AlbumPickerButton";
import { getLocale } from "@/lib/locale";

interface ImageCardProps {
  image: ImageEntry;
  onClick: (image: ImageEntry) => void;
  albums: AlbumInfo[];
  activeAlbumId: number | null;
}

const formatTime = (ts: number) => {
  const d = new Date(ts);
  return d.toLocaleString(getLocale(), { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
};

const handleVideoMouseEnter = (e: React.MouseEvent<HTMLVideoElement>) => {
  (e.target as HTMLVideoElement).play();
};

const handleVideoMouseLeave = (e: React.MouseEvent<HTMLVideoElement>) => {
  const v = e.target as HTMLVideoElement;
  v.pause();
  v.currentTime = 0;
};

const ImageCard = ({ image, onClick, albums, activeAlbumId }: ImageCardProps) => {
  const { t } = useTranslation();

  const handleClick = useCallback(() => onClick(image), [onClick, image]);
  const handleContextClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    onClick(image);
  }, [onClick, image]);

  return (
    <AlbumContextMenu
      mediaId={image.id}
      filePath={image.file_path}
      albums={albums}
      activeAlbumId={activeAlbumId}
      onShowContext={handleClick}
    >
    <div
      className="group relative overflow-hidden rounded-md cursor-pointer animate-fade-in break-inside-avoid mb-3"
      onClick={handleClick}
    >
      {image.fileType === "video" ? (
        <video
          src={image.src}
          className="w-full h-auto object-cover transition-transform duration-500 group-hover:scale-105"
          muted
          preload="metadata"
          onMouseEnter={handleVideoMouseEnter}
          onMouseLeave={handleVideoMouseLeave}
        />
      ) : (
        <img
          src={image.src}
          alt={t("gallery.photoBy", { sender: image.sender })}
          className="w-full h-auto object-cover transition-transform duration-500 group-hover:scale-105"
          loading="lazy"
        />
      )}

      {/* File type badge */}
      {image.fileType !== "image" && (
        <div className="absolute top-2 right-2 bg-background/70 backdrop-blur-sm text-foreground text-[10px] font-medium px-1.5 py-0.5 rounded flex items-center gap-1">
          {image.fileType === "video" && <Play className="h-2.5 w-2.5" />}
          {image.fileType.toUpperCase()}
        </div>
      )}

      {/* Album picker button */}
      <div className="absolute top-2 left-2 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
        <AlbumPickerButton
          mediaId={image.id}
          albums={albums}
          className="flex items-center justify-center h-7 w-7 rounded-full bg-background/70 backdrop-blur-sm text-foreground hover:bg-background/90 transition-colors"
        />
      </div>

      {/* Hover overlay */}
      <div className="absolute inset-0 bg-gradient-to-t from-background/90 via-background/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none flex flex-col justify-end p-4">
        <p className="text-[13px] font-medium text-foreground">{image.sender}</p>
        <p className="text-[11px] text-muted-foreground mt-0.5">{formatTime(image.timestamp)}</p>
        <button
          className="pointer-events-auto flex items-center gap-1.5 mt-2 text-[11px] text-primary hover:text-primary/80 transition-colors"
          onClick={handleContextClick}
        >
          <MessageCircle className="h-3 w-3" />
          {t("gallery.showContext")}
        </button>
      </div>
    </div>
    </AlbumContextMenu>
  );
};

export default memo(ImageCard);
