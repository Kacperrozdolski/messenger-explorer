import { invoke, convertFileSrc } from "@tauri-apps/api/core";
import type { ChatSource, SenderInfo, ImageEntry, ChatMessage, AlbumInfo } from "@/data/types";

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

export interface DetectFormatResult {
  format: "facebook" | "messenger";
  resolvedPath: string;
}

export async function detectFormat(
  exportPath: string
): Promise<DetectFormatResult[]> {
  return invoke("cmd_detect_format", { exportPath });
}

export async function extractZip(zipPath: string): Promise<string> {
  return invoke("cmd_extract_zip", { zipPath });
}

export async function extractZips(zipPaths: string[]): Promise<string> {
  return invoke("cmd_extract_zips", { zipPaths });
}

export async function cleanupZipExtract(extractedPath: string): Promise<void> {
  return invoke("cmd_cleanup_zip_extract", { extractedPath });
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
  albumId?: number;
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
      album_id: filters.albumId ?? null,
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

export interface MediaPageResult {
  items: ImageEntry[];
  nextCursor: string | null;
}

export async function getMediaPage(filters: {
  conversationId?: number;
  senderId?: number;
  fileType?: string;
  search?: string;
  albumId?: number;
  sort: string;
  cursorMonth?: string;
  monthsPerPage: number;
}): Promise<MediaPageResult> {
  const data = await invoke<{
    items: {
      id: number;
      file_path: string;
      sender_name: string;
      timestamp_ms: number;
      conversation_title: string;
      chat_type: string;
      file_type: string;
      conversation_id: number;
      sender_id: number;
    }[];
    next_cursor: string | null;
  }>("cmd_get_media_page", {
    filters: {
      conversation_id: filters.conversationId ?? null,
      sender_id: filters.senderId ?? null,
      file_type: filters.fileType ?? null,
      search: filters.search ?? null,
      album_id: filters.albumId ?? null,
      sort: filters.sort,
      cursor_month: filters.cursorMonth ?? null,
      months_per_page: filters.monthsPerPage,
    },
  });
  return {
    items: data.items.map((m) => ({
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
    })),
    nextCursor: data.next_cursor,
  };
}

export async function getMediaByIds(ids: number[]): Promise<ImageEntry[]> {
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
  >("cmd_get_media_by_ids", { ids });
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

export async function getMediaCount(filters: {
  conversationId?: number;
  senderId?: number;
  fileType?: string;
  month?: string;
  search?: string;
  albumId?: number;
}): Promise<number> {
  return invoke("cmd_get_media_count", {
    filters: {
      conversation_id: filters.conversationId ?? null,
      sender_id: filters.senderId ?? null,
      file_type: filters.fileType ?? null,
      month: filters.month ?? null,
      search: filters.search ?? null,
      album_id: filters.albumId ?? null,
      sort: "date-desc",
      limit: null,
      offset: null,
    },
  });
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

export interface FileTypeCounts {
  image: number;
  video: number;
  gif: number;
}

export interface FilterFacets {
  conversations: { id: number; title: string; chat_type: string; media_count: number }[];
  senders: { id: number; name: string; media_count: number }[];
  timeline: TimelineEntry[];
  file_type_counts: FileTypeCounts;
}

export async function getFilterFacets(filters: {
  conversationId?: number;
  senderId?: number;
  fileType?: string;
  month?: string;
  search?: string;
  albumId?: number;
}): Promise<FilterFacets> {
  return invoke("cmd_get_filter_facets", {
    filters: {
      conversation_id: filters.conversationId ?? null,
      sender_id: filters.senderId ?? null,
      file_type: filters.fileType ?? null,
      month: filters.month ?? null,
      search: filters.search ?? null,
      album_id: filters.albumId ?? null,
      sort: "date-desc",
      limit: null,
      offset: null,
    },
  });
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

export async function getAlbums(): Promise<AlbumInfo[]> {
  const data = await invoke<
    {
      id: number;
      name: string;
      media_count: number;
      color: string;
      created_at: number;
    }[]
  >("cmd_get_albums");
  return data.map((a) => ({
    id: a.id,
    name: a.name,
    mediaCount: a.media_count,
    color: a.color,
    createdAt: a.created_at,
  }));
}

export async function createAlbum(name: string, color: string): Promise<number> {
  return invoke("cmd_create_album", { name, color });
}

export async function renameAlbum(albumId: number, name: string): Promise<void> {
  return invoke("cmd_rename_album", { albumId, name });
}

export async function updateAlbumColor(albumId: number, color: string): Promise<void> {
  return invoke("cmd_update_album_color", { albumId, color });
}

export async function deleteAlbum(albumId: number): Promise<void> {
  return invoke("cmd_delete_album", { albumId });
}

export async function addMediaToAlbum(albumId: number, mediaId: number): Promise<void> {
  return invoke("cmd_add_media_to_album", { albumId, mediaId });
}

export async function removeMediaFromAlbum(albumId: number, mediaId: number): Promise<void> {
  return invoke("cmd_remove_media_from_album", { albumId, mediaId });
}

export async function getMediaAlbums(mediaId: number): Promise<number[]> {
  return invoke("cmd_get_media_albums", { mediaId });
}

export interface ExportPdfResult {
  exported_count: number;
  skipped_count: number;
}

export async function exportAlbumPdf(albumId: number, outputPath: string): Promise<ExportPdfResult> {
  return invoke("cmd_export_album_pdf", { albumId, outputPath });
}

export async function exportAlbumFolder(albumId: number, outputPath: string): Promise<ExportPdfResult> {
  return invoke("cmd_export_album_folder", { albumId, outputPath });
}

export async function showInFolder(path: string): Promise<void> {
  return invoke("cmd_show_in_folder", { path });
}

// --- AI Search ---

export interface IndexingProgress {
  indexed: number;
  total: number;
  is_running: boolean;
}

export async function getIndexingStatus(): Promise<IndexingProgress> {
  return invoke("cmd_get_indexing_status");
}

export async function hasClipModels(): Promise<boolean> {
  return invoke("cmd_has_clip_models");
}

export async function startIndexing(): Promise<void> {
  return invoke("cmd_start_indexing");
}

export async function cancelIndexing(): Promise<void> {
  return invoke("cmd_cancel_indexing");
}

export interface UnindexedCounts {
  senders: { id: number; total_images: number; unindexed: number }[];
  conversations: { id: number; total_images: number; unindexed: number }[];
}

export async function getUnindexedCounts(): Promise<UnindexedCounts> {
  return invoke("cmd_get_unindexed_counts");
}

export interface IndexingScope {
  sender_ids: number[];
  conversation_ids: number[];
}

export async function getIndexingScope(): Promise<IndexingScope> {
  return invoke("cmd_get_indexing_scope");
}

export async function startIndexingFiltered(
  senderIds: number[],
  conversationIds: number[]
): Promise<void> {
  return invoke("cmd_start_indexing_filtered", { senderIds, conversationIds });
}

export interface AiSearchResult {
  media_id: number;
  score: number;
}

export async function aiSearch(
  query: string,
  limit?: number
): Promise<AiSearchResult[]> {
  return invoke("cmd_ai_search", { query, limit: limit ?? 100 });
}

export async function clearEmbeddings(): Promise<void> {
  return invoke("cmd_clear_embeddings");
}
