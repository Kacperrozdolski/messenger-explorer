import { invoke, convertFileSrc } from "@tauri-apps/api/core";
import type { ChatSource, SenderInfo, ImageEntry, ChatMessage } from "@/data/types";

export interface ImportStatus {
  has_data: boolean;
  media_count: number;
  conversation_count: number;
}

export interface ImportResult {
  conversations: number;
  media: number;
  senders: number;
}

export interface TimelineEntry {
  label: string;
  month_key: string;
  count: number;
}

export interface SourceInfo {
  source_type: "facebook" | "messenger";
  source_path: string;
  conversations: number;
  media_count: number;
}

export async function getImportStatus(): Promise<ImportStatus> {
  return invoke("cmd_get_import_status");
}

export async function importExport(
  exportPaths: string[],
  contextWindow?: number
): Promise<ImportResult> {
  return invoke("cmd_import_export", {
    exportPaths,
    contextWindow: contextWindow ?? 5,
  });
}

export async function addSource(
  exportPath: string,
  contextWindow?: number
): Promise<ImportResult> {
  return invoke("cmd_add_source", {
    exportPath,
    contextWindow: contextWindow ?? 5,
  });
}

export async function getSources(): Promise<SourceInfo[]> {
  return invoke("cmd_get_sources");
}

export async function removeSource(sourcePath: string): Promise<void> {
  return invoke("cmd_remove_source", { sourcePath });
}

export async function detectFormat(
  exportPath: string
): Promise<"facebook" | "messenger"> {
  return invoke("cmd_detect_format", { exportPath });
}

export async function getConversations(): Promise<ChatSource[]> {
  const data = await invoke<
    { id: number; title: string; chat_type: string; media_count: number }[]
  >("cmd_get_conversations");
  return data.map((c) => ({
    id: c.id,
    name: c.title,
    type: c.chat_type as "group" | "dm",
    mediaCount: c.media_count,
  }));
}

export async function getSenders(): Promise<SenderInfo[]> {
  const data = await invoke<
    { id: number; name: string; media_count: number }[]
  >("cmd_get_senders");
  return data.map((s) => ({
    id: s.id,
    name: s.name,
    mediaCount: s.media_count,
  }));
}

export async function getMedia(filters: {
  conversationId?: number;
  senderId?: number;
  fileType?: string;
  month?: string;
  search?: string;
  sort: string;
  limit?: number;
  offset?: number;
}): Promise<ImageEntry[]> {
  const data = await invoke<
    {
      id: number;
      file_path: string;
      sender_name: string;
      timestamp_ms: number;
      conversation_title: string;
      chat_type: string;
      file_type: string;
      conversation_id: number;
      sender_id: number;
    }[]
  >("cmd_get_media", {
    filters: {
      conversation_id: filters.conversationId ?? null,
      sender_id: filters.senderId ?? null,
      file_type: filters.fileType ?? null,
      month: filters.month ?? null,
      search: filters.search ?? null,
      sort: filters.sort,
      limit: filters.limit ?? null,
      offset: filters.offset ?? null,
    },
  });
  return data.map((m) => ({
    id: m.id,
    src: convertFileSrc(m.file_path, "media"),
    file_path: m.file_path,
    sender: m.sender_name,
    senderId: m.sender_id,
    timestamp: m.timestamp_ms,
    chat: m.conversation_title,
    chatId: m.conversation_id,
    chatType: m.chat_type as "group" | "dm",
    fileType: m.file_type as "image" | "video" | "gif",
  }));
}

export async function getContext(
  mediaId: number
): Promise<{ contextBefore: ChatMessage[]; contextAfter: ChatMessage[] }> {
  const data = await invoke<{
    media: unknown;
    context_before: { sender_name: string; content: string; timestamp_ms: number }[];
    context_after: { sender_name: string; content: string; timestamp_ms: number }[];
  }>("cmd_get_context", { mediaId });

  return {
    contextBefore: data.context_before.map((m) => ({
      sender: m.sender_name,
      text: m.content,
      timestamp: m.timestamp_ms,
    })),
    contextAfter: data.context_after.map((m) => ({
      sender: m.sender_name,
      text: m.content,
      timestamp: m.timestamp_ms,
    })),
  };
}

export async function getTimeline(): Promise<TimelineEntry[]> {
  return invoke("cmd_get_timeline");
}

export interface StorageInfo {
  db_size_bytes: number;
}

export async function getStorageInfo(): Promise<StorageInfo> {
  return invoke("cmd_get_storage_info");
}

export async function clearDatabase(): Promise<void> {
  return invoke("cmd_clear_database");
}
