import { MessageCircle, Play } from "lucide-react";
import type { ImageEntry } from "@/data/types";

interface ImageCardProps {
  image: ImageEntry;
  index: number;
  onClick: () => void;
}

const formatTime = (ts: number) => {
  const d = new Date(ts);
  return d.toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
};

const ImageCard = ({ image, index, onClick }: ImageCardProps) => {
  return (
    <div
      className="group relative overflow-hidden rounded-md cursor-pointer opacity-0 animate-fade-in break-inside-avoid mb-3"
      style={{ animationDelay: `${index * 40}ms` }}
      onClick={onClick}
    >
      {image.fileType === "video" ? (
        <video
          src={image.src}
          className="w-full h-auto object-cover transition-transform duration-500 group-hover:scale-105"
          muted
          preload="metadata"
          onMouseEnter={(e) => (e.target as HTMLVideoElement).play()}
          onMouseLeave={(e) => { const v = e.target as HTMLVideoElement; v.pause(); v.currentTime = 0; }}
        />
      ) : (
        <img
          src={image.src}
          alt={`Photo by ${image.sender}`}
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

      {/* Hover overlay */}
      <div className="absolute inset-0 bg-gradient-to-t from-background/90 via-background/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex flex-col justify-end p-4">
        <p className="text-[13px] font-medium text-foreground">{image.sender}</p>
        <p className="text-[11px] text-muted-foreground mt-0.5">{formatTime(image.timestamp)}</p>
        <button
          className="flex items-center gap-1.5 mt-2 text-[11px] text-primary hover:text-primary/80 transition-colors"
          onClick={(e) => {
            e.stopPropagation();
            onClick();
          }}
        >
          <MessageCircle className="h-3 w-3" />
          Show Context
        </button>
      </div>
    </div>
  );
};

export default ImageCard;
