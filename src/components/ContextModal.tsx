import { X, MessageCircle } from "lucide-react";
import type { ImageEntry, ChatMessage } from "@/data/messages";
import { cn } from "@/lib/utils";

interface ContextModalProps {
  image: ImageEntry;
  onClose: () => void;
}

const formatTime = (ts: string) => {
  const d = new Date(ts);
  return d.toLocaleString("en-US", { hour: "numeric", minute: "2-digit" });
};

const formatDate = (ts: string) => {
  const d = new Date(ts);
  return d.toLocaleString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });
};

const ChatBubble = ({ msg, isImageSender }: { msg: ChatMessage; isImageSender: boolean }) => (
  <div className={cn("flex flex-col gap-0.5", isImageSender ? "items-end" : "items-start")}>
    <span className="text-[10px] text-muted-foreground px-1">{msg.sender} · {formatTime(msg.timestamp)}</span>
    <div
      className={cn(
        "px-3 py-2 rounded-lg text-[13px] max-w-[85%]",
        isImageSender
          ? "bg-primary text-primary-foreground rounded-br-sm"
          : "bg-secondary text-secondary-foreground rounded-bl-sm"
      )}
    >
      {msg.text}
    </div>
  </div>
);

const ContextModal = ({ image, onClose }: ContextModalProps) => {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={onClose}>
      {/* Backdrop */}
      <div className="absolute inset-0 bg-background/85 backdrop-blur-sm" />

      {/* Modal */}
      <div
        className="relative z-10 flex bg-card rounded-lg border border-border shadow-2xl max-w-5xl w-[95vw] max-h-[90vh] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close */}
        <button
          onClick={onClose}
          className="absolute top-3 right-3 z-20 p-1.5 rounded-md bg-background/60 hover:bg-background text-muted-foreground hover:text-foreground transition-colors"
        >
          <X className="h-4 w-4" />
        </button>

        {/* Image */}
        <div className="flex-1 flex items-center justify-center bg-background/50 min-w-0 p-4">
          <img
            src={image.src}
            alt={`Photo by ${image.sender}`}
            className="max-w-full max-h-[80vh] object-contain rounded-md"
          />
        </div>

        {/* Chat context panel */}
        <div className="w-80 shrink-0 border-l border-border flex flex-col">
          {/* Header */}
          <div className="px-4 py-3 border-b border-border">
            <div className="flex items-center gap-2">
              <MessageCircle className="h-4 w-4 text-primary" />
              <h3 className="text-sm font-semibold text-foreground">Chat Context</h3>
            </div>
            <p className="text-[11px] text-muted-foreground mt-1">{image.chat}</p>
            <p className="text-[11px] text-muted-foreground">{formatDate(image.timestamp)}</p>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
            {/* Before */}
            {image.contextBefore.map((msg, i) => (
              <ChatBubble key={`before-${i}`} msg={msg} isImageSender={msg.sender === image.sender} />
            ))}

            {/* The image message */}
            <div className={cn("flex flex-col gap-0.5", "items-end")}>
              <span className="text-[10px] text-muted-foreground px-1">{image.sender} · {formatTime(image.timestamp)}</span>
              <div className="bg-primary/10 border border-primary/20 rounded-lg p-1.5 rounded-br-sm">
                <img src={image.src} alt="" className="h-24 w-auto rounded object-cover" />
              </div>
            </div>

            {/* After */}
            {image.contextAfter.map((msg, i) => (
              <ChatBubble key={`after-${i}`} msg={msg} isImageSender={msg.sender === image.sender} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ContextModal;
