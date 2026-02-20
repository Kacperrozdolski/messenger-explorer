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

export type SortOption = "date-desc" | "date-asc" | "sender";
export type ViewMode = "grid" | "list";
export type FileTypeFilter = "all" | "image" | "video" | "gif";
