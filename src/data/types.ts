export interface ChatMessage {
  sender: string;
  text: string;
  timestamp: number; // timestamp_ms
}

export interface ImageEntry {
  id: number;
  src: string; // convertFileSrc URL for display
  file_path: string; // absolute path on disk
  sender: string;
  senderId: number;
  timestamp: number; // timestamp_ms
  chat: string; // conversation title
  chatId: number;
  chatType: "group" | "dm";
  fileType: "image" | "video" | "gif";
}

export interface ChatSource {
  id: number;
  name: string;
  type: "group" | "dm";
  mediaCount: number;
}

export interface SenderInfo {
  id: number;
  name: string;
  mediaCount: number;
}

export interface AlbumInfo {
  id: number;
  name: string;
  mediaCount: number;
  color: string;
  createdAt: number;
}

export const ALBUM_COLORS = [
  "#f87171", "#fb923c", "#fbbf24", "#a3e635",
  "#34d399", "#22d3ee", "#60a5fa", "#a78bfa",
  "#f472b6", "#e879f9", "#94a3b8", "#fca5a5",
  "#fdba74", "#fde047", "#86efac", "#67e8f9",
] as const;

export type SortOption = "date-desc" | "date-asc" | "sender";
export type ViewMode = "grid" | "list";
export type FileTypeFilter = "all" | "image" | "video" | "gif";
