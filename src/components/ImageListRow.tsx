import { MessageCircle } from "lucide-react";
import type { ImageEntry } from "@/data/messages";

interface ImageListRowProps {
  image: ImageEntry;
  index: number;
  onClick: () => void;
}

const formatTime = (ts: string) => {
  const d = new Date(ts);
  return d.toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
};

const ImageListRow = ({ image, index, onClick }: ImageListRowProps) => {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-4 w-full px-4 py-2.5 rounded-md hover:bg-accent/50 transition-colors text-left opacity-0 animate-fade-in"
      style={{ animationDelay: `${index * 30}ms` }}
    >
      <img
        src={image.src}
        alt={`Photo by ${image.sender}`}
        className="h-12 w-12 rounded object-cover shrink-0"
      />
      <div className="flex-1 min-w-0">
        <p className="text-[13px] font-medium text-foreground truncate">{image.sender}</p>
        <p className="text-[11px] text-muted-foreground">{image.chat}</p>
      </div>
      <p className="text-[11px] text-muted-foreground whitespace-nowrap">{formatTime(image.timestamp)}</p>
      <MessageCircle className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
    </button>
  );
};

export default ImageListRow;
